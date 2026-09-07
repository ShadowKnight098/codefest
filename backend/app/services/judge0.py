import httpx
import itertools
import asyncio
import os
import sys
import time
import tempfile
import shutil
import subprocess
import re
from typing import List, Optional, Dict, Any
from app.core.config import settings

WRAPPER_TEMPLATE = r'''
# --- Fest Dynamic Function Harness ---
import sys
import json
import ast

def _auto_parse_val(s):
    s = s.strip()
    if not s:
        return ""
    try:
        return ast.literal_eval(s)
    except Exception:
        pass
    if "," in s:
        parts = [p.strip() for p in s.split(",") if p.strip()]
        try:
            return [ast.literal_eval(p) for p in parts]
        except Exception:
            return parts
    return s

def _run_fest_harness():
    raw_in = sys.stdin.read().strip()
    all_funcs = [
        obj for name, obj in list(globals().items())
        if callable(obj) and not name.startswith("_") and hasattr(obj, "__code__") and (obj.__code__.co_filename == "<string>" or "solution.py" in obj.__code__.co_filename)
    ]
    user_funcs = [f for f in all_funcs if f.__name__ not in ("_run_fest_harness", "_auto_parse_val")]
    if not user_funcs:
        return

    target_func = user_funcs[-1]
    param_count = target_func.__code__.co_argcount

    if param_count == 0:
        res = target_func()
        if res is not None:
            print(res)
        return

    if "|" in raw_in:
        arg_chunks = raw_in.split("|")
    elif "\n" in raw_in:
        arg_chunks = raw_in.splitlines()
    elif "," in raw_in and param_count > 1:
        arg_chunks = raw_in.split(",")
    else:
        arg_chunks = raw_in.split()

    parsed_args = [_auto_parse_val(c) for c in arg_chunks if c.strip() != ""]

    try:
        if len(parsed_args) >= param_count:
            res = target_func(*parsed_args[:param_count])
        elif len(parsed_args) == 1 and param_count > 1 and isinstance(parsed_args[0], (list, tuple)):
            res = target_func(*parsed_args[0][:param_count])
        else:
            res = target_func(*parsed_args)
            
        if res is not None:
            if isinstance(res, (list, tuple)):
                print(json.dumps(res) if any(isinstance(x, (list, dict)) for x in res) else str(res).replace("(", "[").replace(")", "]"))
            elif isinstance(res, bool):
                print(str(res).lower())
            else:
                print(res)
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    _run_fest_harness()
'''

def enhance_python_code(code: str) -> str:
    has_main = "__main__" in code
    has_direct_print = re.search(r"^\s*print\s*\(", code, re.MULTILINE) is not None
    if has_main or has_direct_print:
        return code
    return f"{code}\n\n{WRAPPER_TEMPLATE}"

def _execute_sync(
    source_code: str,
    language: str,
    stdin: str = "",
    expected_output: Optional[str] = None,
    cpu_time_limit_sec: float = 2.0
) -> Dict[str, Any]:
    """Synchronous execution using subprocess.run, compatible with all Windows event loops."""
    lang = language.lower().strip()
    temp_dir = tempfile.mkdtemp(prefix="codefest_exec_")
    t0 = time.perf_counter()

    try:
        stdout_text = ""
        stderr_text = ""
        compile_output = ""
        status_id = 3 # Default Accepted
        status_desc = "Accepted"

        if lang in ("python", "py"):
            file_path = os.path.join(temp_dir, "solution.py")
            prepared_code = enhance_python_code(source_code)
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(prepared_code)

            try:
                proc = subprocess.run(
                    [sys.executable, "-u", file_path],
                    input=stdin.encode("utf-8"),
                    capture_output=True,
                    timeout=cpu_time_limit_sec
                )
                stdout_text = proc.stdout.decode("utf-8", errors="replace")
                stderr_text = proc.stderr.decode("utf-8", errors="replace")

                if proc.returncode != 0:
                    status_id = 11
                    status_desc = "Runtime Error (NZEC)"
            except subprocess.TimeoutExpired:
                status_id = 5
                status_desc = "Time Limit Exceeded"
                stderr_text = f"Execution exceeded time limit of {cpu_time_limit_sec}s."

        elif lang == "java":
            file_path = os.path.join(temp_dir, "Main.java")
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(source_code)

            # Compile
            try:
                c_proc = subprocess.run(
                    ["javac", file_path],
                    capture_output=True,
                    timeout=10.0
                )
                if c_proc.returncode != 0:
                    status_id = 6
                    status_desc = "Compilation Error"
                    compile_output = c_proc.stderr.decode("utf-8", errors="replace")
                else:
                    # Run
                    r_proc = subprocess.run(
                        ["java", "-cp", temp_dir, "Main"],
                        input=stdin.encode("utf-8"),
                        capture_output=True,
                        timeout=cpu_time_limit_sec
                    )
                    stdout_text = r_proc.stdout.decode("utf-8", errors="replace")
                    stderr_text = r_proc.stderr.decode("utf-8", errors="replace")
                    if r_proc.returncode != 0:
                        status_id = 11
                        status_desc = "Runtime Error"
            except FileNotFoundError:
                status_id = 6
                status_desc = "Compiler Not Found"
                compile_output = "JDK 'javac' not found on server. Install Java JDK or use Python."
            except subprocess.TimeoutExpired:
                status_id = 5
                status_desc = "Time Limit Exceeded"

        elif lang in ("c", "cpp"):
            compiler = "gcc" if lang == "c" else "g++"
            src_ext = ".c" if lang == "c" else ".cpp"
            src_path = os.path.join(temp_dir, f"solution{src_ext}")
            out_exe = os.path.join(temp_dir, "solution.exe" if sys.platform == "win32" else "solution")

            with open(src_path, "w", encoding="utf-8") as f:
                f.write(source_code)

            try:
                c_proc = subprocess.run(
                    [compiler, src_path, "-O2", "-o", out_exe],
                    capture_output=True,
                    timeout=10.0
                )
                if c_proc.returncode != 0:
                    status_id = 6
                    status_desc = "Compilation Error"
                    compile_output = c_proc.stderr.decode("utf-8", errors="replace")
                else:
                    r_proc = subprocess.run(
                        [out_exe],
                        input=stdin.encode("utf-8"),
                        capture_output=True,
                        timeout=cpu_time_limit_sec
                    )
                    stdout_text = r_proc.stdout.decode("utf-8", errors="replace")
                    stderr_text = r_proc.stderr.decode("utf-8", errors="replace")
                    if r_proc.returncode != 0:
                        status_id = 11
                        status_desc = "Runtime Error"
            except FileNotFoundError:
                status_id = 6
                status_desc = "Compiler Not Found"
                compile_output = f"'{compiler}' (MinGW/GCC) is not installed on the server host. Please install MinGW or use Python/Java."
            except subprocess.TimeoutExpired:
                status_id = 5
                status_desc = "Time Limit Exceeded"
        else:
            status_id = 6
            status_desc = "Unsupported Language"
            compile_output = f"Language '{language}' is not supported by the local execution engine."

        exec_time = round(time.perf_counter() - t0, 3)

        # Check correctness against expected_output
        passed = False
        if status_id == 3:
            if expected_output is not None:
                # Normalize line breaks and trailing whitespace
                norm_actual = "\n".join(line.rstrip() for line in stdout_text.strip().splitlines())
                norm_exp = "\n".join(line.rstrip() for line in expected_output.strip().splitlines())
                passed = (norm_actual == norm_exp)
                if not passed:
                    status_id = 4
                    status_desc = "Wrong Answer"
            else:
                passed = True

        return {
            "success": True,
            "endpoint_used": "local_builtin_sandbox",
            "passed": passed,
            "status_id": status_id,
            "status": status_desc,
            "stdout": stdout_text.strip(),
            "stderr": stderr_text.strip(),
            "compile_output": compile_output.strip(),
            "execution_time_sec": exec_time
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"Execution error: {str(e)}",
            "details": [str(e)]
        }
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

async def run_local_code(
    source_code: str,
    language: str,
    stdin: str = "",
    expected_output: Optional[str] = None,
    cpu_time_limit_sec: float = 2.0
) -> Dict[str, Any]:
    """Runs synchronous execution inside a worker thread to keep the asyncio event loop unblocked."""
    return await asyncio.to_thread(
        _execute_sync,
        source_code,
        language,
        stdin,
        expected_output,
        cpu_time_limit_sec
    )

class Judge0LoadBalancer:
    """
    Distributes code execution submissions across multiple Judge0 instances (e.g. 4 laptops).
    Uses round-robin rotation and fast circuit-breaker health tracking.
    Seamlessly falls back to local built-in sandbox instantaneously if external nodes are unreachable.
    """
    def __init__(self, endpoints: Optional[List[str]] = None):
        configured = endpoints if endpoints is not None else settings.judge0_endpoint_list
        self.endpoints = [e.rstrip("/") for e in configured if e and e.strip()]
        self._cycle = itertools.cycle(self.endpoints) if self.endpoints else None
        self._offline_until: Dict[str, float] = {}
        self.timeout = 10.0

    def get_next_endpoint(self) -> Optional[str]:
        if not self._cycle:
            return None
        now = time.time()
        for _ in range(len(self.endpoints)):
            ep = next(self._cycle)
            if self._offline_until.get(ep, 0) < now:
                return ep
        return None

    def get_headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if settings.JUDGE0_AUTH_TOKEN:
            headers["X-Auth-Token"] = settings.JUDGE0_AUTH_TOKEN
        return headers

    async def check_health(self) -> Dict[str, bool]:
        """Check health of all configured Judge0 nodes."""
        status_map = {}
        async with httpx.AsyncClient(timeout=1.0) as client:
            for ep in self.endpoints:
                try:
                    res = await client.get(f"{ep}/about", headers=self.get_headers())
                    is_ok = res.status_code == 200
                    status_map[ep] = is_ok
                    if not is_ok:
                        self._offline_until[ep] = time.time() + 60.0
                except Exception:
                    status_map[ep] = False
                    self._offline_until[ep] = time.time() + 60.0
        return status_map

    async def execute_code(
        self,
        source_code: str,
        language: str,
        stdin: str = "",
        expected_output: Optional[str] = None,
        cpu_time_limit_sec: float = 2.0,
        memory_limit_mb: int = 256
    ) -> Dict[str, Any]:
        """
        Submits code to next Judge0 worker node with wait=true for fast synchronous execution.
        If all Judge0 nodes are offline or unreachable, seamlessly runs on the local sandbox without latency.
        """
        lang_id = settings.judge0_language_map.get(language.lower(), 71)

        payload = {
            "source_code": source_code,
            "language_id": lang_id,
            "stdin": stdin,
            "cpu_time_limit": cpu_time_limit_sec,
            "memory_limit": memory_limit_mb * 1024, # KB
        }
        if expected_output is not None:
            payload["expected_output"] = expected_output

        endpoint = self.get_next_endpoint()
        if endpoint:
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(connect=0.4, read=self.timeout, write=2.0, pool=2.0)) as client:
                    url = f"{endpoint}/submissions?wait=true&base64_encoded=false"
                    res = await client.post(url, json=payload, headers=self.get_headers())
                    if res.status_code in [200, 201]:
                        data = res.json()
                        status_id = data.get("status", {}).get("id", 0)
                        status_desc = data.get("status", {}).get("description", "Unknown")
                        stdout = data.get("stdout") or ""
                        stderr = data.get("stderr") or ""
                        compile_output = data.get("compile_output") or ""
                        exec_time = data.get("time")
                        passed = (status_id == 3)

                        return {
                            "success": True,
                            "endpoint_used": endpoint,
                            "passed": passed,
                            "status_id": status_id,
                            "status": status_desc,
                            "stdout": stdout.strip(),
                            "stderr": stderr.strip(),
                            "compile_output": compile_output.strip(),
                            "execution_time_sec": float(exec_time) if exec_time else None
                        }
                    else:
                        self._offline_until[endpoint] = time.time() + 60.0
            except Exception:
                # Mark endpoint offline for 60s so subsequent tests don't stall
                self._offline_until[endpoint] = time.time() + 60.0

        # Seamless Instant Fallback: Execute using built-in local runner
        local_res = await run_local_code(
            source_code=source_code,
            language=language,
            stdin=stdin,
            expected_output=expected_output,
            cpu_time_limit_sec=cpu_time_limit_sec
        )
        return local_res

judge0_service = Judge0LoadBalancer()

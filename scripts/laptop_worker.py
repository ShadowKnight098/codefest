# TechFest 2026 - Zero-Docker Lightweight Code Execution Worker
import sys, os, json, time, argparse, tempfile, shutil, subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler

def run_submission(source_code: str, language_id: int, stdin: str = '', cpu_time_limit: float = 2.0):
    lang = 'python'
    if language_id in (50, 48, 49): lang = 'c'
    elif language_id in (54, 52, 53): lang = 'cpp'
    elif language_id in (62,): lang = 'java'
    elif language_id in (71, 70): lang = 'python'

    temp_dir = tempfile.mkdtemp(prefix='worker_exec_')
    t0 = time.perf_counter()
    stdout_text = ''
    stderr_text = ''
    compile_output = ''
    status_id = 3
    status_desc = 'Accepted'

    try:
        if lang == 'python':
            file_path = os.path.join(temp_dir, 'solution.py')
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(source_code)
            try:
                proc = subprocess.run([sys.executable, '-u', file_path], input=stdin.encode('utf-8'), capture_output=True, timeout=cpu_time_limit)
                stdout_text = proc.stdout.decode('utf-8', errors='replace')
                stderr_text = proc.stderr.decode('utf-8', errors='replace')
                if proc.returncode != 0:
                    status_id = 11
                    status_desc = 'Runtime Error (NZEC)'
            except subprocess.TimeoutExpired:
                status_id = 5
                status_desc = 'Time Limit Exceeded'
                stderr_text = f'Execution exceeded time limit of {cpu_time_limit}s.'
        elif lang == 'java':
            file_path = os.path.join(temp_dir, 'Main.java')
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(source_code)
            try:
                c_proc = subprocess.run(['javac', file_path], capture_output=True, timeout=10.0)
                if c_proc.returncode != 0:
                    status_id = 6
                    status_desc = 'Compilation Error'
                    compile_output = c_proc.stderr.decode('utf-8', errors='replace')
                else:
                    r_proc = subprocess.run(['java', '-cp', temp_dir, 'Main'], input=stdin.encode('utf-8'), capture_output=True, timeout=cpu_time_limit)
                    stdout_text = r_proc.stdout.decode('utf-8', errors='replace')
                    stderr_text = r_proc.stderr.decode('utf-8', errors='replace')
                    if r_proc.returncode != 0:
                        status_id = 11
                        status_desc = 'Runtime Error'
            except FileNotFoundError:
                status_id = 6
                status_desc = 'Compiler Not Found'
                compile_output = 'JDK javac not found on worker laptop.'
            except subprocess.TimeoutExpired:
                status_id = 5
                status_desc = 'Time Limit Exceeded'
        elif lang in ('c', 'cpp'):
            compiler = 'gcc' if lang == 'c' else 'g++'
            src_ext = '.c' if lang == 'c' else '.cpp'
            src_path = os.path.join(temp_dir, f'solution{src_ext}')
            out_exe = os.path.join(temp_dir, 'solution.exe' if sys.platform == 'win32' else 'solution')
            with open(src_path, 'w', encoding='utf-8') as f:
                f.write(source_code)
            try:
                c_proc = subprocess.run([compiler, src_path, '-O2', '-o', out_exe], capture_output=True, timeout=10.0)
                if c_proc.returncode != 0:
                    status_id = 6
                    status_desc = 'Compilation Error'
                    compile_output = c_proc.stderr.decode('utf-8', errors='replace')
                else:
                    r_proc = subprocess.run([out_exe], input=stdin.encode('utf-8'), capture_output=True, timeout=cpu_time_limit)
                    stdout_text = r_proc.stdout.decode('utf-8', errors='replace')
                    stderr_text = r_proc.stderr.decode('utf-8', errors='replace')
                    if r_proc.returncode != 0:
                        status_id = 11
                        status_desc = 'Runtime Error'
            except FileNotFoundError:
                status_id = 6
                status_desc = 'Compiler Not Found'
                compile_output = f'{compiler} (MinGW) not installed on worker laptop.'
            except subprocess.TimeoutExpired:
                status_id = 5
                status_desc = 'Time Limit Exceeded'
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

    exec_time = round(time.perf_counter() - t0, 3)
    return {
        'status': {'id': status_id, 'description': status_desc},
        'stdout': stdout_text,
        'stderr': stderr_text,
        'compile_output': compile_output,
        'time': str(exec_time)
    }

class WorkerHTTPHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/about' or self.path.startswith('/about'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'version': '1.13.0-fest-worker', 'status': 'operational'}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if '/submissions' in self.path:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body.decode('utf-8'))
            except Exception:
                self.send_response(400)
                self.end_headers()
                return
            res = run_submission(data.get('source_code', ''), int(data.get('language_id', 71)), data.get('stdin', ''), float(data.get('cpu_time_limit', 2.0)))
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(res).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        print(f'[Worker] {args[0]} - {args[1]}')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=2358)
    parser.add_argument('--host', type=str, default='0.0.0.0')
    args = parser.parse_args()
    server = HTTPServer((args.host, args.port), WorkerHTTPHandler)
    print(f'TechFest Worker Running on http://{args.host}:{args.port}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('Stopped.')

if __name__ == '__main__':
    main()

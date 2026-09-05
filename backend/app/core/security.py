import hmac
import hashlib
import time
from typing import Optional, Dict, Tuple
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
import bcrypt
from app.core.config import settings

ALGORITHM = "HS256"

# In-memory fallback rate limiter & failed attempt tracker
# Keys: identifier (roll_number or ip) -> (failure_count, lockout_until_timestamp)
_attempt_store: Dict[str, Tuple[int, float]] = {}

def hash_pin(pin: str) -> str:
    """Hash participant PIN using native bcrypt."""
    pin_bytes = pin.encode('utf-8')[:72]
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(pin_bytes, salt).decode('utf-8')

def verify_pin(plain_pin: str, hashed_pin: str) -> bool:
    """Verify participant PIN against native bcrypt hash."""
    try:
        pin_bytes = plain_pin.encode('utf-8')[:72]
        hash_bytes = hashed_pin.encode('utf-8')
        return bcrypt.checkpw(pin_bytes, hash_bytes)
    except Exception:
        return False

def create_session_token(participant_id: str, roll_number: str) -> str:
    """Generate secure session token stored inside HTTP-only cookie."""
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.SESSION_EXPIRE_HOURS)
    payload = {
        "sub": str(participant_id),
        "roll_number": roll_number,
        "type": "participant",
        "exp": expire,
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)

def create_admin_session_token(admin_id: str, username: str, role: str) -> str:
    """Generate secure admin session token with role claims."""
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.SESSION_EXPIRE_HOURS)
    payload = {
        "sub": str(admin_id),
        "username": username,
        "role": role,
        "type": "admin",
        "exp": expire,
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)

def decode_session_token(token: str) -> Optional[dict]:
    """Decode and validate session token from cookie."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None

def check_login_rate_limit(identifier: str) -> Tuple[bool, Optional[str]]:
    """
    Check if an identifier (roll_number or IP) is currently locked out.
    Returns (is_allowed, error_message).
    """
    now = time.time()
    record = _attempt_store.get(identifier)
    if not record:
        return True, None
    
    count, lockout_until = record
    if lockout_until > now:
        remaining = int(lockout_until - now)
        minutes = max(1, remaining // 60)
        return False, f"Too many failed attempts. Account temporarily locked for {minutes} minute(s)."
    
    # Lockout period expired, reset counter if it had timed out
    if lockout_until > 0 and lockout_until <= now:
        _attempt_store.pop(identifier, None)
        
    return True, None

def record_login_failure(identifier: str) -> int:
    """
    Record failed login attempt. If threshold exceeded, enforce lockout.
    Returns current failure count.
    """
    now = time.time()
    record = _attempt_store.get(identifier)
    count = 1
    if record:
        old_count, lockout = record
        if lockout <= now: # past lockout or no lockout yet
            count = old_count + 1
        else:
            count = old_count + 1
    
    lockout_until = 0.0
    if count >= settings.MAX_LOGIN_ATTEMPTS:
        lockout_until = now + (settings.LOCKOUT_DURATION_MINUTES * 60)
    
    _attempt_store[identifier] = (count, lockout_until)
    return count

def record_login_success(identifier: str):
    """Clear failed login attempts upon successful login."""
    _attempt_store.pop(identifier, None)

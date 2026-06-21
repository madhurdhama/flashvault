"""flashvault config"""

import os

HOST = "0.0.0.0"
PORT = 8000

SHARED_DIR = os.path.join(os.path.expanduser("~"), "FlashVault")

MAX_CONTENT_LENGTH = 50 * 1024 * 1024 * 1024   # 50 GB per file
MIN_FREE_SPACE = 20 * 1024 * 1024 * 1024       # always leave this much free

# new random key every restart unless SECRET_KEY is set — fine, nothing uses sessions yet
SECRET_KEY = os.environ.get("SECRET_KEY", os.urandom(32))
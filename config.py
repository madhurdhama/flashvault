"""
Application configuration for FlashVault
"""

import os

# Server configuration
HOST = "0.0.0.0"
PORT = 8000

# Storage configuration
SHARED_DIR = os.path.join(os.path.expanduser("~"), "FlashVault")

# Upload limits
MAX_CONTENT_LENGTH = 40 * 1024 * 1024 * 1024   # 40 GB max upload size
STORAGE_QUOTA = 100 * 1024 * 1024 * 1024       # 100 GB total storage limit

# Security
SECRET_KEY = os.environ.get("SECRET_KEY", os.urandom(32))
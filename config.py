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
MAX_CONTENT_LENGTH = 50 * 1024 * 1024 * 1024   # 50 GB max per file
MIN_FREE_SPACE = 20 * 1024 * 1024 * 1024       # Keep 20 GB free (buffer)

# Security
SECRET_KEY = os.environ.get("SECRET_KEY", os.urandom(32))
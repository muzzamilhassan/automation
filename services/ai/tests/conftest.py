"""Make services/ai importable to the pytest suite regardless of invocation cwd."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

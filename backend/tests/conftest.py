import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

TEST_AUTH_HEADERS = {"Authorization": "Bearer test-token"}

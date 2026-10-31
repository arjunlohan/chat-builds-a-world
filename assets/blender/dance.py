"""Original procedural dance reaction. Shared construction and choreography are in reaction_scene.py."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from reaction_scene import build
build("dance")

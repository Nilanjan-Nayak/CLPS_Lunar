"""Build terrain features for every historical landing attempt and train the exploratory outcome model."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from engine import model

if __name__ == "__main__":
    m = model.train()
    print(json.dumps({k: m[k] for k in ("n", "positives", "majorityBaselineAccuracy", "looCv", "coefficientsStandardized", "demSource")}, indent=1))

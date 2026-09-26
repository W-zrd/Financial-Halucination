import subprocess
from pathlib import Path


def test_default_environment_is_openagentic(tmp_path):
    script = Path(__file__).parents[1] / "switch-env.sh"
    (tmp_path / "switch-env.sh").write_text(script.read_text())
    (tmp_path / ".env.openagentic").write_text("PROFILE=openagentic\n")
    result = subprocess.run(["bash", str(tmp_path / "switch-env.sh")], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert (tmp_path / ".env").read_text() == "PROFILE=openagentic\n"
    assert (tmp_path / ".env").stat().st_mode & 0o777 == 0o600


def test_example_profiles_define_required_defaults():
    root = Path(__file__).parents[1]
    for name in ("openagentic", "zai"):
        values = dict(line.split("=", 1) for line in (root / f".env.{name}.example").read_text().splitlines() if "=" in line and not line.startswith("#"))
        assert values["TRADINGAGENTS_LLM_MAX_RETRIES"] == "15"
        assert values["TRADINGAGENTS_CHECKPOINT_ENABLED"] == "true"
        assert values["TRADINGAGENTS_RESULTS_DIR"] == "./results"
        if name == "openagentic":
            assert values["TRADINGAGENTS_QUICK_THINK_LLM"] == "deepseek-v4.1-flash"
            assert values["TRADINGAGENTS_DEEP_THINK_LLM"] == "deepseek-v4.1-flash"

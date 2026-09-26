from types import SimpleNamespace

from tradingagents.graph.trading_graph import TradingAgentsGraph


def test_run_graph_streams_chunks_to_callback_and_merges_final_state():
    graph = object.__new__(TradingAgentsGraph)
    chunks = [
        {"messages": [SimpleNamespace(content="Market analysis ready")]},
        {"final_trade_decision": "Rating: Hold"},
    ]
    graph.graph = SimpleNamespace(stream=lambda *_args, **_kwargs: iter(chunks))
    graph.propagator = SimpleNamespace(get_graph_args=lambda: {})
    graph.create_run_state = lambda *_args: {"company_of_interest": "AMD"}
    graph.checkpoint_input = lambda state: state
    graph.debug = False
    graph._log_state = lambda *_args: None
    graph.record_decision = lambda *_args: None
    graph.clear_checkpoint_on_success = lambda *_args: None
    seen = []

    final_state, signal = graph._run_graph(
        "AMD", "2026-09-24", on_chunk=seen.append
    )

    assert seen == chunks
    assert final_state["messages"][0].content == "Market analysis ready"
    assert final_state["final_trade_decision"] == "Rating: Hold"
    assert signal == "Hold"

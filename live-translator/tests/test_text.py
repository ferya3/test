from livesub.srt import format_timestamp, srt_entry
from livesub.translate import build_messages, clean_reply


def test_format_timestamp():
    assert format_timestamp(0) == "00:00:00,000"
    assert format_timestamp(61.5) == "00:01:01,500"
    assert format_timestamp(3725.0049) == "01:02:05,005"
    assert format_timestamp(-1) == "00:00:00,000"


def test_srt_entry():
    assert srt_entry(3, 1.25, 4, "سلام") == "3\n00:00:01,250 --> 00:00:04,000\nسلام\n\n"


def test_history_goes_in_as_conversation_turns():
    msgs = build_messages("And you?", [("How are you?", "حالت چطوره؟")], "fa")
    assert [m["role"] for m in msgs] == ["system", "user", "assistant", "user"]
    assert "Persian" in msgs[0]["content"]
    assert msgs[-1]["content"] == "And you?"


def test_clean_reply_strips_thinking_and_quotes():
    assert clean_reply("<think>\nhmm\n</think>\n«سلام»") == "سلام"
    assert clean_reply('  "خوبم"  ') == "خوبم"

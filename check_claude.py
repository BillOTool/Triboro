#!/usr/bin/env python3
"""Verify the Claude switch end to end. Run once after adding .anthropic-key:

    python3 check_claude.py

Makes three small live calls (a few cents at most) and prints what it costs,
so you can sanity-check the per-call spend before running a real generation.
"""
import importlib.util
import sys

spec = importlib.util.spec_from_file_location("s", "server.py")
m = importlib.util.module_from_spec(spec)
sys.modules["s"] = m
spec.loader.exec_module(m)

# Published per-MTok rates, for a rough cost readout only.
RATES = {"claude-opus-5": (5.0, 25.0), "claude-haiku-4-5": (1.0, 5.0)}


def cost(model, usage):
    inp, out = RATES.get(model, (0, 0))
    return (usage.input_tokens * inp + usage.output_tokens * out) / 1_000_000


def main():
    if not m.API_KEY:
        sys.exit(
            "No key found.\n"
            "  Put a PERSONAL key (console.anthropic.com as botoole12@gmail.com)\n"
            "  in .anthropic-key, or export TRIBORO_ANTHROPIC_KEY.\n"
            "  ANTHROPIC_API_KEY is deliberately ignored so a work key can't be used."
        )
    print(f"key loaded ({len(m.API_KEY)} chars)\n")
    total = 0.0

    print(f"[1/3] chat model — {m.CHAT_MODEL}")
    reply = m._client().messages.create(
        model=m.CHAT_MODEL, max_tokens=100,
        system="You are Gus Pelletier, a gruff League of Trades plumber in Triboro. "
               "Reply in one short sentence, fully in character.",
        messages=[{"role": "user", "content": "the elevator's stuck again"}],
    )
    txt = "".join(b.text for b in reply.content if b.type == "text").strip()
    c = cost(m.CHAT_MODEL, reply.usage); total += c
    print(f"  Gus: {txt}\n  (${c:.5f})\n")

    print(f"[2/3] structured authoring — {m.CLAUDE_MODEL}")
    ids = [c["id"] for c in m.list_characters()[:2]]
    event = {"id": "test", "title": "Test: a pipe bursts on Floor 3",
             "description": "Water on the floor. Nobody is happy.", "triboro_offset": 0}
    posts = m.generate_reactions(event, ids, n_per_character=1)
    for p in posts:
        print(f"  {p['character_id']}: {p['text'][:100]}")
    print(f"  -> {len(posts)} posts, schema-valid\n")

    print("[3/3] voice context wired in")
    print(f"  world {len(m.build_world_context())} chars · "
          f"voice {len(m.voice_block())} chars · lore {len(m.lore_block())} chars")
    if not m.lore_block():
        print("  NOTE: lore block empty — no posts marked canon yet.")
        print("        Edit a post in the admin to promote it and start the ratchet.")

    print(f"\nOK. Rough spend this run: ${total:.4f} (excludes the authoring call).")
    print("Nothing was written to data/ — generated posts were not saved.")


if __name__ == "__main__":
    main()

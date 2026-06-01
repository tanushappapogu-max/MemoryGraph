# MemoryGraph Neural Engine

MemoryGraph is not a generic notes app. It is a local call-memory engine with an Obsidian-style graph and a live-agent retrieval loop.

## What Darknet Adds

Darknet is vendored as a Git submodule at `external/darknet`.

It is an open-source neural network framework written in C/CUDA. It is useful here as:

- a native neural runtime reference
- a buildable C backend we can compile locally
- a future path for local learned classifiers or routing models

It is not, by itself, the call-memory system. Darknet is primarily a computer-vision neural network framework. MemoryGraph's call intelligence is built from graph memory, heat, embeddings, and spreading activation.

Build Darknet locally:

```bash
git submodule update --init --recursive
npm run darknet:build
```

Clean generated native artifacts:

```bash
npm run darknet:clean
```

## Actual Call-Memory Network

The working neural-memory loop is:

```text
transcript
  -> source chunks
  -> extracted people / topics / commitments / questions / objections
  -> memory nodes
  -> weighted edges
  -> heat points
  -> live activation
  -> evidence-ranked answer
```

## Node Types

Current implemented primitives:

- `Person`
- `Call`
- `Memory`
- `Topic`
- `Question`
- `Objection`
- `Commitment`
- `MemoryEdge`
- `Pattern`

Next backend primitives to add:

- `SourceChunk`: exact transcript spans
- `Embedding`: local vector per chunk/node
- `ActivationRun`: each live retrieval pass
- `ActivationTrace`: why nodes activated and how activation spread

## Spreading Activation

When live dialogue arrives:

```text
"Alex asked if hardware delay affects roadmap"
```

MemoryGraph currently activates:

1. exact person match: `Alex Rivera`
2. topic hit: `hardware`
3. hot topic weight: hardware heat score
4. graph edges from matching memories
5. patterns involving person/topic
6. commitments/questions linked to activated memories

The answer is generated from deterministic evidence first. AI can be added later as a language layer, but the retrieval should work without AI.

## Why This Is Like Obsidian For Calls

Obsidian gives you linked notes. MemoryGraph gives you linked call memories:

- zoom into nodes to inspect exact context
- topic nodes grow when repeated across calls
- edges explain how one call connects to another
- live agent uses activated paths to tell you what to say

The UI is a map of memory. The API is what a Cluely/Zoom sidecar should call.

## Future Darknet Use

Darknet can become useful if we add native learned models for:

- classifying transcript chunks into memory types
- detecting urgency/commitment/objection labels
- routing live dialogue into activation categories
- running local CPU/GPU inference without a hosted model

For text embeddings and semantic retrieval, a transformer embedding model or local vector runtime is still the right tool. Darknet is included because you asked to use it, and because having a buildable native neural runtime gives us a real systems-level path rather than pretending the UI is the neural network.

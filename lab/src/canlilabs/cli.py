"""Commands use explicit workspaces; only bounded local CPU work is supported here."""

import argparse
import json
import sys
from pathlib import Path

from .data import register_csv
from .recipes import predict, train
from .records import Ledger


def parser():
    root = argparse.ArgumentParser(prog="canlilabs")
    root.add_argument("--workspace", type=Path, default=Path(".lab"))
    commands = root.add_subparsers(dest="command", required=True)
    training = commands.add_parser("train", help="Run a bounded real CPU recipe")
    training.add_argument("recipe", choices=["ml", "dl", "rl"])
    training.add_argument("--seed", type=int, default=7)
    training.add_argument("--epochs", type=int, default=30)
    training.add_argument("--episodes", type=int, default=1500)
    training.add_argument("--evaluation-episodes", type=int, default=200)
    listing = commands.add_parser("runs", help="List trials, including failures")
    listing.add_argument("--limit", type=int, default=20)
    listing.add_argument("--offset", type=int, default=0)
    showing = commands.add_parser("show", help="Read a run with its provenance and metrics")
    showing.add_argument("run_id")
    inference = commands.add_parser("predict", help="Load a verified checkpoint and run inference")
    inference.add_argument("run_id")
    inference.add_argument("--rows", required=True, help="JSON feature matrix or RL state IDs")
    dataset = commands.add_parser(
        "register-data", help="Register a bounded local CSV with declared rights"
    )
    dataset.add_argument("path", type=Path)
    dataset.add_argument("--source", required=True)
    dataset.add_argument("--license", dest="license_id", required=True)
    dataset.add_argument("--target", default="label")
    return root


def main(argv=None):
    args = parser().parse_args(argv)
    try:
        if args.command == "train":
            result = train(
                args.workspace,
                args.recipe,
                seed=args.seed,
                epochs=args.epochs,
                episodes=args.episodes,
                evaluation_episodes=args.evaluation_episodes,
            )
        elif args.command == "runs":
            result = Ledger(args.workspace).list(args.limit, args.offset)
        elif args.command == "show":
            result = Ledger(args.workspace).get(args.run_id)
        elif args.command == "predict":
            if len(args.rows) > 1024 * 1024:
                raise ValueError("Prediction input must fit within 1 MiB.")
            result = predict(args.workspace, args.run_id, json.loads(args.rows))
        else:
            result = register_csv(
                args.workspace,
                args.path,
                source=args.source,
                license_id=args.license_id,
                target=args.target,
            )
        print(json.dumps(result, indent=2, sort_keys=True, allow_nan=False))
        return 0
    except (ValueError, OSError) as error:
        print(json.dumps({"error": type(error).__name__, "message": str(error)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

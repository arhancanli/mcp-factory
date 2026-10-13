"""Commands use explicit workspaces; only bounded local CPU work is supported here."""

import argparse
import json
import sys
from pathlib import Path

from .data import register_csv
from .lifecycle import compare, model_card
from .recipes import predict, train
from .records import Ledger
from .tabular import prepare_tabular


def data_options(command):
    command.add_argument("--dataset-id")
    command.add_argument(
        "--task", choices=["classification", "regression"], default="classification"
    )
    command.add_argument("--features", nargs="+", help="Explicit ordered numeric feature columns")
    command.add_argument("--split-strategy", choices=["random", "group", "time"], default="random")
    command.add_argument("--split-seed", type=int, default=2718)
    command.add_argument("--group-column")
    command.add_argument("--time-column")


def data_config(args):
    return {
        name: getattr(args, name)
        for name in [
            "dataset_id",
            "task",
            "features",
            "split_strategy",
            "split_seed",
            "group_column",
            "time_column",
        ]
    }


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
    data_options(training)
    preparation = commands.add_parser(
        "prepare-data", help="Profile and split registered numeric data"
    )
    data_options(preparation)
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
    dataset.add_argument(
        "--lineage", type=Path, help="JSON with original hashes and transformations"
    )
    dataset.add_argument("--attribution", help="Dataset creator citation and licence reference")
    recovery = commands.add_parser("recover", help="Record an abandoned trial as failed")
    recovery.add_argument("run_id")
    recovery.add_argument("--reason", required=True)
    repair = commands.add_parser(
        "repair-receipts", help="Verify or rebuild missing ledger receipts"
    )
    repair.add_argument("run_id")
    card = commands.add_parser("model-card", help="Read a hash-verified model card")
    card.add_argument("run_id")
    comparison = commands.add_parser(
        "compare", help="Compare trials sharing the same split protocol"
    )
    comparison.add_argument("run_ids", nargs="+")
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
                **data_config(args),
            )
        elif args.command == "prepare-data":
            result = prepare_tabular(args.workspace, data_config(args))[3]
        elif args.command == "runs":
            result = Ledger(args.workspace).list(args.limit, args.offset)
        elif args.command == "show":
            result = Ledger(args.workspace).get(args.run_id)
        elif args.command == "predict":
            if len(args.rows) > 1024 * 1024:
                raise ValueError("Prediction input must fit within 1 MiB.")
            result = predict(args.workspace, args.run_id, json.loads(args.rows))
        elif args.command == "register-data":
            lineage = None
            if args.lineage:
                if args.lineage.stat().st_size > 32 * 1024:
                    raise ValueError("Lineage metadata must fit within 32 KiB.")
                lineage = json.loads(args.lineage.read_text())
            result = register_csv(
                args.workspace,
                args.path,
                source=args.source,
                license_id=args.license_id,
                target=args.target,
                lineage=lineage,
                attribution=args.attribution,
            )
        elif args.command == "recover":
            result = Ledger(args.workspace).recover(args.run_id, args.reason)
        elif args.command == "repair-receipts":
            result = Ledger(args.workspace).repair_receipts(args.run_id)
        elif args.command == "model-card":
            result = model_card(args.workspace, args.run_id)
        else:
            result = compare(args.workspace, args.run_ids)
        print(json.dumps(result, indent=2, sort_keys=True, allow_nan=False))
        return 0
    except (ValueError, OSError) as error:
        print(json.dumps({"error": type(error).__name__, "message": str(error)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

# Training and research coverage

The owner's "everything" is retained as an expanding coverage matrix. Every
implemented discipline needs a runnable recipe, stated dataset/model rights,
baseline, independent evaluation, artifact reload, resource needs, and honest
limitations. This matrix defines work, not completed features.

| Track | Required coverage | Initial implementation | Remaining work |
| --- | --- | --- | --- |
| Foundations | Linear algebra, probability, gradients, optimization, generalization | Planned guided examples | Curriculum and exercises |
| Classical ML | Classification, regression, ensembles, clustering, dimensionality reduction, feature pipelines | CPU classification planned | Broader task recipes and comparisons |
| Deep learning | MLP, CNN, sequence models, transformers, optimization and checkpoints | CPU MLP planned | Vision/text/sequence recipes and accelerators |
| RL | Tabular control, policy gradients, actor-critic, off-policy learning, offline RL, reward design and model-based methods | Seeded tabular control planned | DQN/PPO, multi-seed research evaluations, offline and model-based recipes |
| Foundation models | Tokenizers, language models, embeddings, SFT, LoRA/PEFT, preference tuning, reward models | Planned | Licensed model/data recipes, bounded resource estimates and honest improvement reports |
| Representation learning | Self-supervised, semi-supervised, contrastive and metric learning | Planned | Runnable modality-specific recipes |
| Generative models | Autoregressive, VAE, GAN, diffusion | Planned | Baselines, quality and diversity evaluation |
| Modalities | Tabular, text, images, audio, video, graphs, time series, multimodal | Tabular smoke data planned | Versioned ingestion and recipe coverage |
| Scientific methods | Bayesian methods, uncertainty, causal inference, active learning, search and ablations | Planned | Reproducible method examples and appropriate controls |
| Adaptation | Transfer, multitask, continual, meta and federated learning | Planned | Forgetting, privacy and cross-task evaluations |
| Efficiency | Mixed precision, quantization, distillation, pruning, batching, distributed training | CPU bounded runs planned | Profiled accelerator/distributed and serving recipes |
| Evaluation | Leakage, calibration, robustness, contamination, fairness where appropriate, uncertainty and seed variation | Independent CPU evaluation planned | Comparative suites and realistic deployment shifts |
| Data engineering | Provenance, licences, schema, deduplication, splits, annotation, versioning, streaming | Manifest and split guards planned | Production-scale pipelines and corpora |
| Delivery | Registry, reproducibility, inference, promotion, rollback and monitoring | Local artifacts and ledger planned | Operational deployment and sustained health |

New owner requirements add rows or acceptance criteria. They do not silently
remove prior tracks. Research topics without established measurable completion
criteria should be scoped through executable recipes and empirical results.

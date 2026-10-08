# Current trained text model

The selected latest run uses TF-IDF word/character features plus text cues with logistic regression, replacing XLM-RoBERTa. See `../../docs/TRAINED_MODELS.md` for serving its saved artifacts. The original notebook plan below is historical and does not describe the selected run.

# Training notebooks

The first draft does not contain trained artefacts or fabricated evaluation results. Add versioned Colab notebooks here for:

1. XLM-RoBERTa fine-tuning with class weights, early stopping, stratified validation, and a Drive checkpoint after every epoch.
2. CLIP consistency and SSCD reference-corpus feature extraction.
3. XGBoost behavioural training with explicit missingness and training-only category baselines.
4. Five-fold out-of-fold component probability generation, late fusion, sigmoid calibration, ablation, and SHAP explanation export.

Each notebook must record the seed, dependency pins, split hash, run ID, checkpoint path, and produced artefact hashes. The test split must remain single-use.

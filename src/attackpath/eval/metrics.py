"""Metrics and temperature scaling shared by training and evaluation."""

from __future__ import annotations

import numpy as np
import torch
import torch.nn.functional as F
from sklearn.metrics import average_precision_score, roc_auc_score


def binary_ece(probs: np.ndarray, labels: np.ndarray, bins: int = 15) -> float:
    """Expected calibration error for yes/no predictions: |predicted rate − actual rate|, averaged over bins."""
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(probs, edges) - 1, 0, bins - 1)
    ece = 0.0
    for b in range(bins):
        m = idx == b
        if m.any():
            ece += m.mean() * abs(probs[m].mean() - labels[m].mean())
    return float(ece)


def top1_ece(probs: torch.Tensor, targets: torch.Tensor, bins: int = 15) -> float:
    """Multiclass ECE: confidence of the top choice vs how often the top choice is right."""
    conf, pred = probs.max(dim=1)
    return binary_ece(conf.numpy(), (pred == targets).float().numpy(), bins)


def link_metrics(logits: torch.Tensor, labels: torch.Tensor, temperature: float = 1.0) -> dict:
    p = torch.sigmoid(logits / temperature).numpy()
    y = labels.numpy()
    return {
        "auc": float(roc_auc_score(y, p)),
        "ap": float(average_precision_score(y, p)),
        "ece": binary_ece(p, y),
        "brier": float(np.mean((p - y) ** 2)),
    }


def hop_metrics(logits: list[torch.Tensor], targets: list[int], temperature: float = 1.0) -> dict:
    """Next-hop ranking quality. Graphs have different sizes, so each example is handled on its own."""
    hit = {1: [], 3: [], 5: []}
    rr, nll, conf, correct = [], [], [], []
    for lg, t in zip(logits, targets):
        p = torch.softmax(lg / temperature, dim=0)
        # ties are broken at random: expected hit rate, not a lucky "rank 1"
        greater = int((p > p[t]).sum())
        equal = int((p == p[t]).sum())
        for k in hit:
            hit[k].append(min(1.0, max(0.0, (k - greater) / equal)))
        rr.append(float(np.mean([1 / (greater + i) for i in range(1, equal + 1)])))
        nll.append(float(-torch.log(p[t].clamp_min(1e-12))))
        conf.append(float(p.max()))
        correct.append(hit[1][-1])
    return {
        "top1": float(np.mean(hit[1])),
        "top3": float(np.mean(hit[3])),
        "top5": float(np.mean(hit[5])),
        "mrr": float(np.mean(rr)),
        "nll": float(np.mean(nll)),
        "ece": binary_ece(np.array(conf), np.array(correct)),
        "n": len(rr),
    }


def fit_temperature(loss_fn, init: float = 1.0) -> float:
    """Find T > 0 minimizing loss_fn(T) on the validation set (Guo et al., 2017)."""
    log_t = torch.tensor([float(np.log(init))], requires_grad=True)
    opt = torch.optim.LBFGS([log_t], lr=0.1, max_iter=100)

    def closure():
        opt.zero_grad()
        loss = loss_fn(log_t.exp())
        loss.backward()
        return loss

    opt.step(closure)
    return float(log_t.exp())


def fit_link_temperature(logits: torch.Tensor, labels: torch.Tensor) -> float:
    return fit_temperature(lambda T: F.binary_cross_entropy_with_logits(logits / T, labels))


def fit_hop_temperature(logits: list[torch.Tensor], targets: list[int]) -> float:
    # excluded machines are -inf; a large finite value keeps their probability at 0 without NaN gradients
    logits = [lg.masked_fill(~torch.isfinite(lg), -1e4) for lg in logits]
    return fit_temperature(
        lambda T: torch.stack([F.cross_entropy((lg / T).unsqueeze(0), torch.tensor([t])) for lg, t in zip(logits, targets)]).mean()
    )

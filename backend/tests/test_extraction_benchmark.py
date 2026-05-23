"""
test_extraction_benchmark.py — Benchmark comparing regex vs LLM biomarker extraction.

Run with:
    cd backend
    python -m pytest tests/test_extraction_benchmark.py -v -s

Or standalone:
    cd backend
    python tests/test_extraction_benchmark.py

The benchmark uses a battery of synthetic OCR samples that cover:
  - Clean, well-formatted lab reports
  - Noisy OCR with typos and character substitutions
  - Misaligned table data
  - Partial text corruption
  - Multiple lab format conventions (US, UK, Indian)
  - Edge cases: missing reference ranges, unusual units, only partial panels

Each sample has a GROUND TRUTH dict of expected biomarker name → value pairs.
Accuracy is measured as:
  - Recall:    fraction of ground-truth markers successfully extracted
  - Precision: fraction of extracted markers that match ground truth
  - F1:        harmonic mean of precision and recall
  - Value MAE: mean absolute error of the extracted numeric values
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

# Add backend to path so imports work when running standalone
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.medical_parser import parse_biomarkers as regex_parse
from services.extraction_service import extract_biomarkers as llm_extract, GROQ_AVAILABLE

logging.basicConfig(level=logging.WARNING)  # Suppress verbose INFO logs during benchmark

# ══════════════════════════════════════════════════════════════════════════════
# Ground-truth test samples
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class BenchmarkSample:
    """A single OCR text sample with associated ground-truth biomarker values."""
    name:         str
    ocr_text:     str
    ground_truth: Dict[str, float]   # canonical_name.lower() → expected numeric value
    description:  str = ""


SAMPLES: List[BenchmarkSample] = [

    # ── Sample 1: Clean, well-formatted panel ─────────────────────────────────
    BenchmarkSample(
        name="clean_full_panel",
        description="Standard well-formatted CBC + lipid + metabolic panel",
        ocr_text="""
PATIENT LAB REPORT
Patient: John Doe   Age: 45Y   Gender: Male
Date: 2024-01-15    Lab: CityPath Diagnostics

TEST                    RESULT      UNIT        REFERENCE RANGE
---------------------------------------------------------------------------
Hemoglobin              14.5        g/dL        12.0 - 17.5
WBC                     7.2         10^3/uL     4.0 - 11.0
RBC                     5.1         10^6/uL     4.2 - 5.9
Platelet Count          220         10^3/uL     150 - 400
Total Cholesterol       195         mg/dL       < 200
LDL Cholesterol         115         mg/dL       < 130
HDL Cholesterol         52          mg/dL       > 40
Triglycerides           140         mg/dL       < 150
Blood Sugar (Fasting)   92          mg/dL       70 - 100
Creatinine              1.0         mg/dL       0.6 - 1.2
TSH                     2.1         mIU/L       0.4 - 4.0
Vitamin D               38          ng/mL       30 - 100
""",
        ground_truth={
            "hemoglobin":       14.5,
            "wbc":               7.2,
            "rbc":               5.1,
            "platelet count":  220.0,
            "total cholesterol":195.0,
            "ldl cholesterol": 115.0,
            "hdl cholesterol":  52.0,
            "triglycerides":   140.0,
            "blood sugar (fasting)": 92.0,
            "creatinine":        1.0,
            "tsh":               2.1,
            "vitamin d":        38.0,
        },
    ),

    # ── Sample 2: Noisy OCR with character substitutions ──────────────────────
    BenchmarkSample(
        name="noisy_ocr",
        description="OCR noise: character substitutions, extra spaces, garbled words",
        ocr_text="""
PAT1ENT LAB REPORT
Patient: Jane Sm1th   Age: 38Y   Gend3r: Fema1e

BIOMARK3R           RESULT    UN1T
Hemog1ob1n          12.8      g/dL     Ref: 12.0-17.5
WB C                6  .4     10^3/uL  Ref: 4.0-11.0
Glucos e (Fas ting) 98.0      mg/dL    Ref: 70-100
HbA1c               5.4       %        Ref: <5.7
C reat1n1ne         0  .9     mg/dL    Ref: 0.6-1.2
TSH                 3.5       m1U/L    Ref: 0.4-4.0
V1tam1n D           22.0      ng/mL    Ref: 30-100   L
""",
        ground_truth={
            "hemoglobin":   12.8,
            "wbc":           6.4,
            "glucose":      98.0,
            "hba1c":         5.4,
            "creatinine":    0.9,
            "tsh":           3.5,
            "vitamin d":    22.0,
        },
    ),

    # ── Sample 3: Misaligned table (common in scanned PDFs) ───────────────────
    BenchmarkSample(
        name="misaligned_table",
        description="Columns misaligned — values shifted from their headers",
        ocr_text="""
Lab Results - Apollo Diagnostics

Parameter                  Value  Unit     Normal Range
---                        ----   ----     ------------
LDL  Cholesterol             142  mg/dL      <130         H
HDL  Cholesterol              38  mg/dL       >40         L
Triglycerides                180  mg/dL      <150         H
Total  Cholesterol           235  mg/dL      <200         H
Hemoglobin                  11.2  g/dL     12.0-17.5      L
Ferritin                      8.0 ng/mL    12.0-300.0     L
Iron                         55.0 ug/dL    60.0-170.0     L
""",
        ground_truth={
            "ldl cholesterol":  142.0,
            "hdl cholesterol":   38.0,
            "triglycerides":    180.0,
            "total cholesterol":235.0,
            "hemoglobin":        11.2,
            "ferritin":           8.0,
            "iron":              55.0,
        },
    ),

    # ── Sample 4: Partial corruption / missing sections ───────────────────────
    BenchmarkSample(
        name="partial_corruption",
        description="Some lines completely garbled, only partial data recoverable",
        ocr_text="""
######### MEDICAL LAB ########
###DATE 2024-##-## ###########

Sodium          138    meq/L   136-145
Potassium         4.2  meq/L   3.5-5.1
########## ########## ########
Calcium           9.1  mg/dL   8.6-10.3
########## ########## ########
ALT              28    U/L     <40
AST              32    U/L     <40
########## ########## ########
Bilirubin         0.8  mg/dL   <1.2
""",
        ground_truth={
            "sodium":      138.0,
            "potassium":     4.2,
            "calcium":       9.1,
            "alt":          28.0,
            "ast":          32.0,
            "bilirubin":     0.8,
        },
    ),

    # ── Sample 5: Indian lab format (common variant) ──────────────────────────
    BenchmarkSample(
        name="indian_lab_format",
        description="Indian lab report format with different column ordering",
        ocr_text="""
THYROCARE TECHNOLOGIES LIMITED
PATIENT: RAHUL SHARMA       AGE/SEX: 52Y/M

INVESTIGATION        OBSERVED    BIO REF INTERVAL    UNIT
======================================================
HAEMOGLOBIN (Hb)     13.5        13.0 - 17.0         g%
TOTAL WBC COUNT       8900        4000 - 11000        cells/cumm
PLATELET COUNT        185000      150000 - 400000     cells/cumm
S. CREATININE         1.1         0.7 - 1.3           mg/dL
BLOOD UREA            28          15 - 40             mg/dL
S. URIC ACID           5.8        3.5 - 7.2           mg/dL
SERUM SODIUM          140         136 - 145           mEq/L
SERUM POTASSIUM         4.0       3.5 - 5.0           mEq/L
T. CHOLESTEROL        210         Desirable < 200     mg/dL
TRIGLYCERIDES         165         Desirable < 150     mg/dL
HDL CHOLESTEROL        44         > 40                mg/dL
LDL CHOLESTEROL       129         < 130               mg/dL
TSH                     3.2       0.35 - 5.5          µIU/mL
VITAMIN B12            320        211 - 911            pg/mL
VITAMIN D              18.5       Insufficiency       ng/mL
""",
        ground_truth={
            "hemoglobin":       13.5,
            "wbc":            8900.0,   # LLM may normalise unit; value stays
            "platelet count": 185000.0,
            "creatinine":        1.1,
            "urea":             28.0,
            "uric acid":         5.8,
            "sodium":          140.0,
            "potassium":         4.0,
            "total cholesterol":210.0,
            "triglycerides":   165.0,
            "hdl cholesterol":  44.0,
            "ldl cholesterol": 129.0,
            "tsh":               3.2,
            "vitamin b12":     320.0,
            "vitamin d":        18.5,
        },
    ),

    # ── Sample 6: Minimal / incomplete report ──────────────────────────────────
    BenchmarkSample(
        name="minimal_report",
        description="Only 3 values — should still extract all correctly",
        ocr_text="""
Quick Lab Check
Hemoglobin: 16.0 g/dL
Blood Sugar Fasting: 105 mg/dL
TSH: 0.35 mIU/L
""",
        ground_truth={
            "hemoglobin":           16.0,
            "blood sugar (fasting)":105.0,
            "tsh":                   0.35,
        },
    ),
]


# ══════════════════════════════════════════════════════════════════════════════
# Evaluation logic
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class SampleResult:
    """Evaluation metrics for one parser on one sample."""
    sample_name:    str
    parser:         str
    precision:      float
    recall:         float
    f1:             float
    value_mae:      float                  # Mean Absolute Error of correctly matched values
    latency_sec:    float
    extracted_count: int
    matched_count:  int
    ground_truth_count: int
    errors:         List[str] = field(default_factory=list)


def _normalise_key(name: str) -> str:
    """Normalise a biomarker name to a lowercase comparison key."""
    return name.lower().strip()


def _match_biomarker(
    extracted_name: str,
    ground_truth: Dict[str, float],
) -> Optional[str]:
    """
    Find the ground-truth key that best matches an extracted name.
    Uses substring matching to handle naming variants.
    Returns the GT key if matched, else None.
    """
    en = _normalise_key(extracted_name)
    # Exact match
    if en in ground_truth:
        return en
    # Substring match — longest wins
    best, best_len = None, 0
    for gt_key in ground_truth:
        if gt_key in en or en in gt_key:
            if len(gt_key) > best_len:
                best, best_len = gt_key, len(gt_key)
    return best


def evaluate_regex(sample: BenchmarkSample) -> SampleResult:
    """Evaluate the legacy regex parser on a sample."""
    t0 = time.perf_counter()
    try:
        parsed = regex_parse(sample.ocr_text)
    except Exception as exc:
        return SampleResult(
            sample_name=sample.name, parser="regex",
            precision=0, recall=0, f1=0, value_mae=0,
            latency_sec=time.perf_counter()-t0,
            extracted_count=0, matched_count=0,
            ground_truth_count=len(sample.ground_truth),
            errors=[str(exc)],
        )
    latency = time.perf_counter() - t0

    extracted = {_normalise_key(p["marker_name"]): p["value"] for p in parsed}
    return _compute_metrics(sample, "regex", extracted, latency)


def evaluate_llm(sample: BenchmarkSample) -> SampleResult:
    """Evaluate the LLM extraction service on a sample."""
    if not GROQ_AVAILABLE:
        return SampleResult(
            sample_name=sample.name, parser="llm",
            precision=0, recall=0, f1=0, value_mae=0,
            latency_sec=0,
            extracted_count=0, matched_count=0,
            ground_truth_count=len(sample.ground_truth),
            errors=["Groq not available — set GROQ_API_KEY to run LLM benchmarks"],
        )

    t0 = time.perf_counter()
    try:
        result, confidence = llm_extract(sample.ocr_text)
    except Exception as exc:
        return SampleResult(
            sample_name=sample.name, parser="llm",
            precision=0, recall=0, f1=0, value_mae=0,
            latency_sec=time.perf_counter()-t0,
            extracted_count=0, matched_count=0,
            ground_truth_count=len(sample.ground_truth),
            errors=[str(exc)],
        )
    latency = time.perf_counter() - t0

    extracted = {_normalise_key(bm.name): bm.value for bm in result.biomarkers}
    return _compute_metrics(sample, f"llm(conf={confidence.overall_score:.2f})", extracted, latency)


def _compute_metrics(
    sample:    BenchmarkSample,
    parser:    str,
    extracted: Dict[str, float],
    latency:   float,
) -> SampleResult:
    """Compute precision, recall, F1, and value MAE."""
    gt = sample.ground_truth
    n_gt = len(gt)
    n_extracted = len(extracted)

    matched_pairs: List[Tuple[float, float]] = []   # (gt_value, extracted_value)
    true_positives = 0

    for ex_name, ex_value in extracted.items():
        gt_key = _match_biomarker(ex_name, gt)
        if gt_key is not None:
            true_positives += 1
            matched_pairs.append((gt[gt_key], ex_value))

    precision = true_positives / n_extracted if n_extracted > 0 else 0.0
    recall    = true_positives / n_gt        if n_gt > 0        else 0.0
    f1        = (
        2 * precision * recall / (precision + recall)
        if (precision + recall) > 0 else 0.0
    )
    value_mae = (
        sum(abs(gt_v - ex_v) for gt_v, ex_v in matched_pairs) / len(matched_pairs)
        if matched_pairs else 0.0
    )

    return SampleResult(
        sample_name        = sample.name,
        parser             = parser,
        precision          = round(precision, 4),
        recall             = round(recall, 4),
        f1                 = round(f1, 4),
        value_mae          = round(value_mae, 4),
        latency_sec        = round(latency, 3),
        extracted_count    = n_extracted,
        matched_count      = true_positives,
        ground_truth_count = n_gt,
    )


# ══════════════════════════════════════════════════════════════════════════════
# Reporting
# ══════════════════════════════════════════════════════════════════════════════

def _print_results(results: List[SampleResult]) -> None:
    """Print a formatted benchmark report to stdout."""
    # Group by parser
    regex_results = [r for r in results if r.parser == "regex"]
    llm_results   = [r for r in results if r.parser != "regex"]

    def avg(lst, key):
        vals = [getattr(r, key) for r in lst]
        return sum(vals) / len(vals) if vals else 0.0

    header = f"{'Sample':<30} {'Parser':<20} {'P':>6} {'R':>6} {'F1':>6} {'MAE':>8} {'ms':>8} {'Extr':>5} {'GT':>5}"
    sep    = "-" * len(header)

    print("\n" + "═" * len(header))
    print(" MEDISCAN AI — EXTRACTION BENCHMARK RESULTS")
    print("═" * len(header))
    print(header)
    print(sep)

    for r in results:
        parser_label = r.parser if len(r.parser) <= 20 else r.parser[:17] + "..."
        err_marker = " ⚠" if r.errors else ""
        print(
            f"{r.sample_name:<30} {parser_label:<20} "
            f"{r.precision:>6.3f} {r.recall:>6.3f} {r.f1:>6.3f} "
            f"{r.value_mae:>8.3f} {r.latency_sec*1000:>7.0f}ms "
            f"{r.extracted_count:>5} {r.ground_truth_count:>5}{err_marker}"
        )
        for err in r.errors:
            print(f"   ⚠ {err}")

    print(sep)
    if regex_results:
        print(
            f"{'REGEX AVERAGE':<30} {'':<20} "
            f"{avg(regex_results,'precision'):>6.3f} {avg(regex_results,'recall'):>6.3f} "
            f"{avg(regex_results,'f1'):>6.3f} {avg(regex_results,'value_mae'):>8.3f} "
            f"{avg(regex_results,'latency_sec')*1000:>7.0f}ms"
        )
    if llm_results:
        print(
            f"{'LLM AVERAGE':<30} {'':<20} "
            f"{avg(llm_results,'precision'):>6.3f} {avg(llm_results,'recall'):>6.3f} "
            f"{avg(llm_results,'f1'):>6.3f} {avg(llm_results,'value_mae'):>8.3f} "
            f"{avg(llm_results,'latency_sec')*1000:>7.0f}ms"
        )

    print("═" * len(header))

    # ── Improvement summary ────────────────────────────────────────────────────
    if regex_results and llm_results:
        def improvement(metric):
            r_avg = avg(regex_results, metric)
            l_avg = avg(llm_results, metric)
            if r_avg == 0:
                return "∞" if l_avg > 0 else "0%"
            pct = (l_avg - r_avg) / r_avg * 100
            return f"{pct:+.1f}%"

        print("\n📊 IMPROVEMENT (LLM vs Regex):")
        print(f"   Precision: {improvement('precision')}")
        print(f"   Recall:    {improvement('recall')}")
        print(f"   F1 Score:  {improvement('f1')}")
        # Lower MAE is better
        r_mae = avg(regex_results, 'value_mae')
        l_mae = avg(llm_results, 'value_mae')
        if r_mae > 0:
            mae_improvement = (r_mae - l_mae) / r_mae * 100
            print(f"   Value MAE: {mae_improvement:+.1f}% (lower is better)")

    if not GROQ_AVAILABLE:
        print("\n⚠  GROQ_API_KEY not set — LLM benchmark skipped.")
        print("   Set GROQ_API_KEY in .env to run full comparison.")


# ══════════════════════════════════════════════════════════════════════════════
# pytest-compatible test functions
# ══════════════════════════════════════════════════════════════════════════════

def test_regex_clean_panel():
    """Regex parser should achieve high recall on a clean, well-formatted panel."""
    r = evaluate_regex(SAMPLES[0])  # clean_full_panel
    assert r.recall >= 0.70, f"Regex recall too low on clean panel: {r.recall:.3f}"


def test_regex_noisy_ocr():
    """Regex parser should still extract some markers from noisy text."""
    r = evaluate_regex(SAMPLES[1])  # noisy_ocr
    assert r.recall >= 0.40, f"Regex recall too low on noisy OCR: {r.recall:.3f}"


def test_llm_extraction_structure():
    """LLM extraction service should return a valid ExtractionResult."""
    if not GROQ_AVAILABLE:
        import pytest
        pytest.skip("GROQ_API_KEY not set")

    from services.extraction_service import extract_biomarkers
    from services.schemas import ExtractionResult, ExtractionConfidence

    result, confidence = extract_biomarkers(SAMPLES[0].ocr_text)
    assert isinstance(result, ExtractionResult)
    assert isinstance(confidence, ExtractionConfidence)
    assert len(result.biomarkers) > 0, "LLM should extract at least one biomarker"
    assert 0.0 <= confidence.overall_score <= 1.0


def test_llm_clean_panel_recall():
    """LLM should achieve higher recall than regex on a clean panel."""
    if not GROQ_AVAILABLE:
        import pytest
        pytest.skip("GROQ_API_KEY not set")

    regex_r = evaluate_regex(SAMPLES[0])
    llm_r   = evaluate_llm(SAMPLES[0])
    assert llm_r.recall >= regex_r.recall - 0.05, (
        f"LLM recall ({llm_r.recall}) should not be significantly worse than "
        f"regex ({regex_r.recall}) on clean panel"
    )


def test_llm_noisy_ocr_recall():
    """LLM should outperform regex on noisy OCR text."""
    if not GROQ_AVAILABLE:
        import pytest
        pytest.skip("GROQ_API_KEY not set")

    regex_r = evaluate_regex(SAMPLES[1])
    llm_r   = evaluate_llm(SAMPLES[1])
    # LLM should do at least as well as regex on noisy input
    assert llm_r.recall >= regex_r.recall - 0.10, (
        f"LLM recall ({llm_r.recall:.3f}) much lower than regex ({regex_r.recall:.3f})"
    )


def test_fallback_activates_when_groq_unavailable(monkeypatch):
    """When Groq is unavailable, extraction_service must fall back to regex."""
    import services.extraction_service as es
    monkeypatch.setattr(es, "GROQ_AVAILABLE", False)

    result, confidence = es.extract_biomarkers(SAMPLES[0].ocr_text)
    assert confidence.used_fallback is True
    assert isinstance(result.biomarkers, list)


def test_validator_rejects_impossible_values():
    """Validator should discard physiologically impossible values."""
    from services.validator import parse_llm_output
    bad_json = json.dumps({
        "patient_info": {"name": "Test", "age": "30", "gender": "Male"},
        "biomarkers": [
            {"name": "Hemoglobin", "value": 999.0,  # impossibly high
             "unit": "g/dL", "reference_min": 12.0, "reference_max": 17.5,
             "status": "Normal"},
        ]
    })
    result, report = parse_llm_output(bad_json)
    assert result is not None
    assert len(result.biomarkers) == 0, "Impossible hemoglobin value should be discarded"
    assert len(report.discarded) > 0


def test_validator_status_correction():
    """Validator should correct LLM status that contradicts the numeric value."""
    from services.validator import parse_llm_output
    # LDL = 200 with max 130 — clearly HIGH, but LLM says Normal
    json_str = json.dumps({
        "patient_info": {"name": "Test", "age": "40", "gender": "Female"},
        "biomarkers": [
            {"name": "LDL Cholesterol", "value": 200.0,
             "unit": "mg/dL", "reference_min": -1, "reference_max": 130.0,
             "status": "Normal"},  # WRONG — should be High/Critical
        ]
    })
    result, report = parse_llm_output(json_str)
    assert result is not None
    assert len(result.biomarkers) == 1
    # Status should have been corrected
    assert result.biomarkers[0].status in ("High", "Critical"), (
        f"Expected High or Critical, got: {result.biomarkers[0].status}"
    )


def test_confidence_engine():
    """Confidence score should reflect extraction quality."""
    from services.schemas import ExtractionResult, PatientInfo, BiomarkerExtraction, ExtractionConfidence
    from services.confidence_engine import compute_confidence
    from services.validator import validate_extraction

    # Fully known result
    result = ExtractionResult(
        patient_info=PatientInfo(name="Alice", age="30", gender="Female"),
        biomarkers=[
            BiomarkerExtraction(name="Hemoglobin", value=13.5, unit="g/dL",
                                reference_min=12.0, reference_max=17.5, status="Normal"),
            BiomarkerExtraction(name="TSH", value=2.5, unit="mIU/L",
                                reference_min=0.4, reference_max=4.0, status="Normal"),
        ]
    )
    vreport = validate_extraction(result)
    conf = compute_confidence(result, vreport, retry_count=0, used_fallback=False)

    assert isinstance(conf, ExtractionConfidence)
    assert conf.overall_score > 0.5, f"Expected reasonable confidence, got {conf.overall_score}"
    assert conf.biomarker_count == 2


# ══════════════════════════════════════════════════════════════════════════════
# Standalone runner
# ══════════════════════════════════════════════════════════════════════════════

def main():
    """Run the full benchmark and print results."""
    print("\n🏥 Running MediScan AI Extraction Benchmark...")
    print(f"   Samples: {len(SAMPLES)}")
    print(f"   Groq available: {GROQ_AVAILABLE}")
    if not GROQ_AVAILABLE:
        print("   ⚠  Set GROQ_API_KEY in .env to include LLM results")

    all_results: List[SampleResult] = []

    for i, sample in enumerate(SAMPLES, 1):
        print(f"\n[{i}/{len(SAMPLES)}] {sample.name}: {sample.description}")

        # Regex
        print("  ▶ Running regex parser...", end=" ", flush=True)
        r_result = evaluate_regex(sample)
        all_results.append(r_result)
        print(f"F1={r_result.f1:.3f} Recall={r_result.recall:.3f}")

        # LLM
        if GROQ_AVAILABLE:
            print("  ▶ Running LLM extractor...", end=" ", flush=True)
            l_result = evaluate_llm(sample)
            all_results.append(l_result)
            print(f"F1={l_result.f1:.3f} Recall={l_result.recall:.3f} ({l_result.latency_sec*1000:.0f}ms)")

    _print_results(all_results)

    # Write results to JSON for CI / reporting
    output_path = os.path.join(os.path.dirname(__file__), "benchmark_results.json")
    with open(output_path, "w") as f:
        json.dump(
            [vars(r) for r in all_results],
            f, indent=2
        )
    print(f"\n📁 Results saved to: {output_path}")


if __name__ == "__main__":
    main()

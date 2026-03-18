CREATE TABLE IF NOT EXISTS source_rows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_file TEXT NOT NULL,
    design_name TEXT,
    variant TEXT,
    report_dir TEXT,
    entity_type TEXT,
    precision_name TEXT,
    clk_mhz REAL,
    dim_k INTEGER,
    dim_m INTEGER,
    dim_n INTEGER,
    mx_flag INTEGER,
    nv_flag INTEGER,
    mx_raw TEXT,
    norm_kind TEXT,
    acc_kind TEXT,
    out_kind TEXT,
    midmat INTEGER,
    area_um2 REAL,
    power_total_mw REAL,
    power_dynamic_mw REAL,
    power_leakage REAL
);

CREATE TABLE IF NOT EXISTS dp_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_row_id INTEGER NOT NULL,
    source_file TEXT NOT NULL,
    design_name TEXT,
    precision_name TEXT,
    clk_mhz REAL,
    dim_k INTEGER,
    mx_flag INTEGER,
    nv_flag INTEGER,
    norm_kind TEXT,
    acc_kind TEXT,
    out_kind TEXT,
    midmat INTEGER,
    area_um2 REAL,
    power_total_mw REAL,
    power_dynamic_mw REAL,
    power_leakage REAL,
    FOREIGN KEY(source_row_id) REFERENCES source_rows(id)
);

CREATE TABLE IF NOT EXISTS array_measurements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_row_id INTEGER NOT NULL,
    source_file TEXT NOT NULL,
    design_name TEXT,
    precision_name TEXT,
    clk_mhz REAL,
    dim_k INTEGER,
    dim_m INTEGER,
    dim_n INTEGER,
    mx_flag INTEGER,
    nv_flag INTEGER,
    norm_kind TEXT,
    acc_kind TEXT,
    out_kind TEXT,
    midmat INTEGER,
    area_um2 REAL,
    power_total_mw REAL,
    power_dynamic_mw REAL,
    power_leakage REAL,
    FOREIGN KEY(source_row_id) REFERENCES source_rows(id)
);

CREATE TABLE IF NOT EXISTS model_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_name TEXT NOT NULL,
    artifact_path TEXT,
    metadata_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dp_units_lookup
ON dp_units (precision_name, dim_k, clk_mhz, mx_flag, nv_flag, norm_kind, acc_kind, out_kind, midmat);

CREATE INDEX IF NOT EXISTS idx_array_lookup
ON array_measurements (precision_name, dim_k, dim_m, dim_n, clk_mhz, mx_flag, nv_flag, norm_kind, acc_kind, out_kind, midmat);

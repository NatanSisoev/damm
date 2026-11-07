-- SQLite schema. Shared contract: agree changes before building on it.
-- Synthetic data only. Open comments are stored redacted only (PII removed before insert).
PRAGMA foreign_keys = ON;

-- Reference data -----------------------------------------------------------

CREATE TABLE collectiu (
  id   INTEGER PRIMARY KEY,
  nom  TEXT NOT NULL UNIQUE            -- Fàbriques, Logística, Comercial, Oficines
);

CREATE TABLE domini (
  id   INTEGER PRIMARY KEY,
  nom  TEXT NOT NULL UNIQUE            -- the 6 domains
);

CREATE TABLE centre_tipus (
  id   INTEGER PRIMARY KEY,
  nom  TEXT NOT NULL UNIQUE            -- fabrica, magatzem, oficina, ...
);

CREATE TABLE torn (
  id   INTEGER PRIMARY KEY,
  nom  TEXT NOT NULL UNIQUE            -- mati, tarda, nit
);

-- Synthetic population (seed only). Denominator for representativeness.
CREATE TABLE empleat_sintetic (
  id               INTEGER PRIMARY KEY,
  collectiu_id     INTEGER NOT NULL REFERENCES collectiu(id),
  centre_tipus_id  INTEGER NOT NULL REFERENCES centre_tipus(id),
  torn_id          INTEGER REFERENCES torn(id),   -- NULL for Comercial and Oficines
  es_manager       INTEGER NOT NULL DEFAULT 0 CHECK (es_manager IN (0,1))
);

-- Accounts (employee side only) ---------------------------------------------

CREATE TABLE joincode (
  codi          TEXT PRIMARY KEY,
  empresa       TEXT NOT NULL,
  collectiu_id  INTEGER NOT NULL REFERENCES collectiu(id),
  actiu         INTEGER NOT NULL DEFAULT 1 CHECK (actiu IN (0,1))
);

-- No email, phone or name. id is opaque (random, not derived from anything personal).
CREATE TABLE compte (
  id               TEXT PRIMARY KEY,
  collectiu_id     INTEGER NOT NULL REFERENCES collectiu(id),
  centre_tipus_id  INTEGER REFERENCES centre_tipus(id),
  torn_id          INTEGER REFERENCES torn(id),
  es_manager       INTEGER NOT NULL DEFAULT 0 CHECK (es_manager IN (0,1)),
  username         TEXT NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  salt             TEXT NOT NULL,
  recovery_hash    TEXT,                           -- one-time recovery code, hashed; cleared once used
  creat            TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Web push subscription: own table, deleted on logout, never joined to analytics.
CREATE TABLE push_subscripcio (
  compte_id  TEXT PRIMARY KEY REFERENCES compte(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  creat      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Content -----------------------------------------------------------------

CREATE TABLE necessitat (
  id            INTEGER PRIMARY KEY,
  text_nl       TEXT NOT NULL,                     -- need in natural language
  collectiu_id  INTEGER REFERENCES collectiu(id),  -- NULL = all collectives
  durada_max_s  INTEGER,
  exclusions    TEXT,
  context       TEXT,                              -- C3 draft: background HR gives the AI
  titol         TEXT,                              -- C3 draft: AI-proposed survey title (editable)
  intro         TEXT,                              -- C3 draft: AI-proposed introduction
  draft_font    TEXT CHECK (draft_font IN ('llm','fallback')), -- C3 draft: where the drafts came from
  estat         TEXT NOT NULL DEFAULT 'oberta' CHECK (estat IN ('oberta','publicada','tancada')),
  creat         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE pregunta (
  id             INTEGER PRIMARY KEY,
  domini_id      INTEGER NOT NULL REFERENCES domini(id),
  collectiu_id   INTEGER REFERENCES collectiu(id),  -- NULL = all collectives
  text           TEXT NOT NULL,
  tipus          TEXT NOT NULL CHECK (tipus IN ('scale5','scale10','yes_no','pair','choice','ranking','open')), -- QuestionType in @damm/shared
  facet          TEXT,                              -- what the item really asks; items with the same facet are interchangeable wordings
  polarity       INTEGER NOT NULL DEFAULT 1 CHECK (polarity IN (1,-1)), -- -1 = negatively worded, score is flipped
  options_json   TEXT,                              -- pair/choice: [{"label","score"}]; ranking: [{"label","domain_id"}]
  is_followup    INTEGER NOT NULL DEFAULT 0 CHECK (is_followup IN (0,1)), -- worded as a follow-up ("has anything changed?")
  necessitat_id  INTEGER REFERENCES necessitat(id), -- NULL = continuous monitoring pool
  estat          TEXT NOT NULL DEFAULT 'draft' CHECK (estat IN ('draft','aprovada','retirada')),
  prioritat      INTEGER NOT NULL DEFAULT 0,        -- approved HR needs get the highest value
  generada_per_ia INTEGER NOT NULL DEFAULT 0 CHECK (generada_per_ia IN (0,1)),
  motiu          TEXT,                              -- C3 draft: one-line reason the AI gives for the question
  ordre          INTEGER NOT NULL DEFAULT 0,        -- C3 draft: position within the need (HR reorders in review)
  aprovada_per   TEXT,                              -- HR user label, set only by a human action
  aprovada_el    TEXT
);

CREATE TABLE publicacio (
  id             INTEGER PRIMARY KEY,
  necessitat_id  INTEGER NOT NULL REFERENCES necessitat(id),
  codi_join      TEXT NOT NULL REFERENCES joincode(codi),
  qr_url         TEXT,
  creat          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Responses (employee side writes; one row per answered question) ----------------

CREATE TABLE resposta (
  id           INTEGER PRIMARY KEY,
  compte_id    TEXT NOT NULL REFERENCES compte(id),
  pregunta_id  INTEGER NOT NULL REFERENCES pregunta(id),
  valor_num    REAL,                                 -- NULL for open questions and ranking; option index for pair/choice
  value_json   TEXT,                                 -- ranking: option indices, best first, e.g. [2,0,3,1]
  score        REAL,                                 -- engine-normalised 0..1, 1 = best; NULL for ranking/open (see docs/engine.md)
  answer_ms    INTEGER,                              -- time from display to answer, for careless-answer detection
  comentari    TEXT,                                 -- redacted text only
  canal        TEXT NOT NULL DEFAULT 'app' CHECK (canal IN ('app','mobil_qr')),
  periode      TEXT NOT NULL,                        -- 'YYYY-MM'
  data         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (compte_id, pregunta_id, data)
);
CREATE INDEX idx_resposta_pregunta ON resposta(pregunta_id, periode);
CREATE INDEX idx_resposta_compte   ON resposta(compte_id, data);

-- Analytics view: no compte_id. HR side and analysis read this, never `resposta`.
CREATE VIEW v_resposta_analitica AS
SELECT r.id, r.pregunta_id, p.domini_id, c.collectiu_id, c.centre_tipus_id, c.torn_id,
       c.es_manager, r.valor_num, r.score, r.comentari, r.periode, r.data
FROM resposta r
JOIN compte c   ON c.id = r.compte_id
JOIN pregunta p ON p.id = r.pregunta_id;

-- Analysis outputs (written by jobs, read by the dashboard) -----------------------

CREATE TABLE tema (
  id           INTEGER PRIMARY KEY,
  etiqueta     TEXT NOT NULL,
  resum        TEXT,
  periode      TEXT NOT NULL,
  n            INTEGER NOT NULL,
  emergent     INTEGER NOT NULL DEFAULT 0 CHECK (emergent IN (0,1)),
  suprimit     INTEGER NOT NULL DEFAULT 0 CHECK (suprimit IN (0,1)),
  -- Comment analysis (engine, docs/engine.md section 12). One row per theme x period x collective (NULL = company).
  collectiu_id INTEGER REFERENCES collectiu(id),
  clau         TEXT,                              -- stable theme key, e.g. 'torns_comunicacio_pauses'
  share        REAL,                              -- n / comments of that collective and period; NULL when suppressed
  font         TEXT NOT NULL DEFAULT 'seed' CHECK (font IN ('seed','rules','llm'))
);

CREATE TABLE comentari_tema (
  resposta_id  INTEGER NOT NULL REFERENCES resposta(id),
  tema_id      INTEGER NOT NULL REFERENCES tema(id),
  confianca    REAL NOT NULL,
  PRIMARY KEY (resposta_id, tema_id)
);

-- n < 10 => suprimit = 1 and the value columns must be NULL.
CREATE TABLE agregat (
  id            INTEGER PRIMARY KEY,
  periode       TEXT NOT NULL,
  collectiu_id  INTEGER REFERENCES collectiu(id),
  torn_id       INTEGER REFERENCES torn(id),
  domini_id     INTEGER REFERENCES domini(id),
  n             INTEGER NOT NULL,
  mitjana       REAL,                              -- unchanged (Jan's dashboard, 1..5)
  score         REAL,                              -- engine domain score 0..10, see docs/engine.md section 4
  confidence    REAL,                              -- engine, 0..100
  consensus     REAL,                              -- engine, 0..100, agreement between people
  suprimit      INTEGER NOT NULL DEFAULT 0 CHECK (suprimit IN (0,1)),
  CHECK (suprimit = 0 OR (mitjana IS NULL AND score IS NULL AND confidence IS NULL AND consensus IS NULL))
);
CREATE INDEX idx_agregat_seg ON agregat(periode, collectiu_id, torn_id, domini_id);

CREATE TABLE senyal (
  id           INTEGER PRIMARY KEY,
  tipus        TEXT NOT NULL CHECK (tipus IN ('emergent','feble','baixa_participacio',
                 'sharp_drop','sustained_decline','changepoint_cluster','polarisation','low_confidence','improvement')),
  descripcio   TEXT NOT NULL,
  collectiu_id INTEGER REFERENCES collectiu(id),
  torn_id      INTEGER REFERENCES torn(id),
  domini_id    INTEGER REFERENCES domini(id),
  periode      TEXT NOT NULL,
  n            INTEGER NOT NULL,
  confianca    REAL,
  severity     TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','action_linked','resolved')),
  audience     TEXT NOT NULL DEFAULT 'hr' CHECK (audience IN ('hr','hr_manager')), -- Lideratge alarms are always 'hr'
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  suprimit     INTEGER NOT NULL DEFAULT 0 CHECK (suprimit IN (0,1))
);

-- AI proposes, a human decides: estat changes only through an HR action.
CREATE TABLE recomanacio (
  id                       INTEGER PRIMARY KEY,
  senyal_id                INTEGER REFERENCES senyal(id),
  text                     TEXT NOT NULL,
  estat                    TEXT NOT NULL DEFAULT 'proposada' CHECK (estat IN ('proposada','aprovada','descartada')),
  seguiment_necessitat_id  INTEGER REFERENCES necessitat(id),  -- follow-up survey
  creat                    TEXT NOT NULL DEFAULT (datetime('now')),
  -- Drafted proposals (C11). `text` holds the concrete action. Owner and timeframe are suggestions, never tracked;
  -- there is deliberately no done/completed column: HR only approves or discards.
  titol                    TEXT,
  iniciativa               TEXT,                               -- Damm initiative the proposal uses
  responsable_suggerit     TEXT,
  termini_suggerit         TEXT,
  justificacio             TEXT,                               -- cites n and confidence
  limits                   TEXT,                               -- honest limits line ("correlació, no causa")
  font                     TEXT CHECK (font IS NULL OR font IN ('llm','template'))
);

-- Engine (Natan, packages/engine; see docs/engine.md) ------------------------------
-- Per-account tables below are engine-side only, like `resposta`: HR code must never read them.

-- Daily batch per account. Fixed for the day once generated.
CREATE TABLE assignment (
  id            INTEGER PRIMARY KEY,
  compte_id     TEXT NOT NULL REFERENCES compte(id) ON DELETE CASCADE,
  pregunta_id   INTEGER NOT NULL REFERENCES pregunta(id),
  day           TEXT NOT NULL,                     -- 'YYYY-MM-DD'
  slot          INTEGER NOT NULL,                  -- 0..questions_per_day-1
  reason        TEXT NOT NULL CHECK (reason IN ('monitor','need','followup')),
  answered_at   TEXT,
  UNIQUE (compte_id, day, slot)
);
CREATE INDEX idx_assignment_compte ON assignment(compte_id, day);

-- Personal trajectory per account x domain (Kalman local level). Never leaves the engine.
CREATE TABLE person_domain_state (
  compte_id                TEXT NOT NULL REFERENCES compte(id) ON DELETE CASCADE,
  domini_id                INTEGER NOT NULL REFERENCES domini(id),
  level                    REAL NOT NULL,          -- 0..1, item-bias adjusted
  variance                 REAL NOT NULL,
  n                        INTEGER NOT NULL DEFAULT 0,
  last_at                  TEXT NOT NULL,
  last_z                   REAL,
  pending_followup_level   REAL,                   -- level before the outlier; NULL = no follow-up pending
  followup_due             TEXT,                   -- 'YYYY-MM-DD'
  confirmed_change_at      TEXT,
  confirmed_change_dir     INTEGER CHECK (confirmed_change_dir IN (1,-1)),
  PRIMARY KEY (compte_id, domini_id)
);

-- Learned per-item baseline (light item-response model). No account data.
CREATE TABLE item_stats (
  pregunta_id  INTEGER PRIMARY KEY REFERENCES pregunta(id),
  bias         REAL NOT NULL DEFAULT 0,
  n            INTEGER NOT NULL DEFAULT 0,
  resid_sum    REAL NOT NULL DEFAULT 0
);

-- Thompson sampling state for question formats, per collective x shift x format.
CREATE TABLE format_stats (
  collectiu_id  INTEGER NOT NULL REFERENCES collectiu(id),
  torn_id       INTEGER NOT NULL DEFAULT 0,          -- 0 = no shift
  tipus         TEXT NOT NULL,
  alpha         REAL NOT NULL DEFAULT 1,
  beta          REAL NOT NULL DEFAULT 1,
  PRIMARY KEY (collectiu_id, torn_id, tipus)
);

-- HR-editable: domain weights and format preferences per collective (NULL collective = default).
CREATE TABLE domain_weight (
  collectiu_id  INTEGER REFERENCES collectiu(id),
  domini_id     INTEGER NOT NULL REFERENCES domini(id),
  weight        REAL NOT NULL DEFAULT 1 CHECK (weight > 0),
  UNIQUE (collectiu_id, domini_id)
);

CREATE TABLE format_preference (
  collectiu_id  INTEGER REFERENCES collectiu(id),
  tipus         TEXT NOT NULL,
  weight        REAL NOT NULL DEFAULT 1 CHECK (weight >= 0), -- 0 = never shown to this collective
  UNIQUE (collectiu_id, tipus)
);

CREATE TABLE engine_config (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- Aggregate outputs written by the engine job (n >= MIN_GROUP_SIZE or suppressed).
CREATE TABLE insight (
  id            INTEGER PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('domain_state','top_mover','polarisation','importance_gap','driver',
                  'trajectory_mix','followup_confirmation','segment_gap','action_effect','narrative')),
  periode       TEXT NOT NULL,
  collectiu_id  INTEGER REFERENCES collectiu(id),
  torn_id       INTEGER REFERENCES torn(id),
  domini_id     INTEGER REFERENCES domini(id),
  n             INTEGER NOT NULL,
  value         REAL,
  detail_json   TEXT,
  suprimit      INTEGER NOT NULL DEFAULT 0 CHECK (suprimit IN (0,1)),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (suprimit = 0 OR (value IS NULL AND detail_json IS NULL))
);

-- Domain importance from ranking answers (Borda weights), per segment.
CREATE TABLE domain_importance (
  periode       TEXT NOT NULL,
  collectiu_id  INTEGER REFERENCES collectiu(id),
  domini_id     INTEGER NOT NULL REFERENCES domini(id),
  n             INTEGER NOT NULL,
  importance    REAL,                              -- 0..1
  suprimit      INTEGER NOT NULL DEFAULT 0 CHECK (suprimit IN (0,1)),
  UNIQUE (periode, collectiu_id, domini_id),
  CHECK (suprimit = 0 OR importance IS NULL)
);

-- Seed only: hidden ground truth for validating analysis. Never shipped with the app.
CREATE TABLE resposta_seed (
  resposta_id  INTEGER PRIMARY KEY REFERENCES resposta(id),
  tema_real    TEXT
);

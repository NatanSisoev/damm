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
  estat         TEXT NOT NULL DEFAULT 'oberta' CHECK (estat IN ('oberta','publicada','tancada')),
  creat         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE pregunta (
  id             INTEGER PRIMARY KEY,
  domini_id      INTEGER NOT NULL REFERENCES domini(id),
  collectiu_id   INTEGER REFERENCES collectiu(id),  -- NULL = all collectives
  text           TEXT NOT NULL,
  tipus          TEXT NOT NULL CHECK (tipus IN ('escala5','escala10','swipe','ranking','obert')),
  necessitat_id  INTEGER REFERENCES necessitat(id), -- NULL = continuous monitoring pool
  estat          TEXT NOT NULL DEFAULT 'draft' CHECK (estat IN ('draft','aprovada','retirada')),
  prioritat      INTEGER NOT NULL DEFAULT 0,        -- approved HR needs get the highest value
  generada_per_ia INTEGER NOT NULL DEFAULT 0 CHECK (generada_per_ia IN (0,1)),
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
  valor_num    REAL,                                 -- NULL for open questions
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
       c.es_manager, r.valor_num, r.comentari, r.periode, r.data
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
  suprimit     INTEGER NOT NULL DEFAULT 0 CHECK (suprimit IN (0,1))
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
  mitjana       REAL,
  suprimit      INTEGER NOT NULL DEFAULT 0 CHECK (suprimit IN (0,1)),
  CHECK (suprimit = 0 OR mitjana IS NULL)
);
CREATE INDEX idx_agregat_seg ON agregat(periode, collectiu_id, torn_id, domini_id);

CREATE TABLE senyal (
  id           INTEGER PRIMARY KEY,
  tipus        TEXT NOT NULL CHECK (tipus IN ('emergent','feble','baixa_participacio')),
  descripcio   TEXT NOT NULL,
  collectiu_id INTEGER REFERENCES collectiu(id),
  periode      TEXT NOT NULL,
  n            INTEGER NOT NULL,
  confianca    REAL,
  suprimit     INTEGER NOT NULL DEFAULT 0 CHECK (suprimit IN (0,1))
);

-- AI proposes, a human decides: estat changes only through an HR action.
CREATE TABLE recomanacio (
  id                       INTEGER PRIMARY KEY,
  senyal_id                INTEGER REFERENCES senyal(id),
  text                     TEXT NOT NULL,
  estat                    TEXT NOT NULL DEFAULT 'proposada' CHECK (estat IN ('proposada','aprovada','descartada')),
  seguiment_necessitat_id  INTEGER REFERENCES necessitat(id),  -- follow-up survey
  creat                    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed only: hidden ground truth for validating analysis. Never shipped with the app.
CREATE TABLE resposta_seed (
  resposta_id  INTEGER PRIMARY KEY REFERENCES resposta(id),
  tema_real    TEXT
);

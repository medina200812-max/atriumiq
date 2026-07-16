"""
AtriumIQ backend — Smart Comfort Analytics for Nazarbayev University
FastAPI + SQLAlchemy + SQLite
"""
import json
import math
import random
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime, inspect, text
from sqlalchemy.orm import sessionmaker, Session, declarative_base

# ---------------------------------------------------------------------------
# Database setup
# ---------------------------------------------------------------------------
DATABASE_PATH = Path(__file__).with_name("atriumiq.db")
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

LOCATIONS = ["Main Atrium", "East Wing", "West Wing", "Library Hall", "Study Pods"]
REPORT_CATEGORIES = ["Too Hot", "Too Noisy", "Too Bright", "Too Dark", "Comfortable", "Other"]
REPORT_STATUSES = ["open", "in_review", "resolved"]
RESULT_JSON_CANDIDATES = [
    Path(__file__).with_name("result.json"),
    Path(__file__).resolve().parent.parent / "result.json",
]


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class Reading(Base):
    __tablename__ = "readings"

    id = Column(Integer, primary_key=True, index=True)
    measured_at = Column(DateTime, index=True, nullable=False)
    location = Column(String, index=True, nullable=False)  # atrium | outside
    temperature = Column(Float, nullable=False)
    brightness = Column(String, nullable=True)
    noise = Column(String, nullable=True)


class SensorReading(Base):
    __tablename__ = "sensor_readings"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    location = Column(String, index=True, default="Main Atrium")
    atrium_temp = Column(Float)
    outdoor_temp = Column(Float)
    noise_db = Column(Float)
    brightness_lux = Column(Float)
    humidity_pct = Column(Float)


class Report(Base):
    __tablename__ = "user_reports"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    category = Column(String, index=True)
    location = Column(String, default="Main Atrium")
    description = Column(String)
    author = Column(String, default="Anonymous")
    status = Column(String, default="open", index=True)

    @property
    def created_at(self):
        return self.timestamp

    @property
    def comment(self):
        return self.description


Base.metadata.create_all(bind=engine)


def ensure_schema():
    inspector = inspect(engine)
    if "user_reports" not in inspector.get_table_names():
        return
    report_columns = {column["name"] for column in inspector.get_columns("user_reports")}
    with engine.begin() as conn:
        if "status" not in report_columns:
            conn.execute(text("ALTER TABLE user_reports ADD COLUMN status VARCHAR DEFAULT 'open'"))
        conn.execute(text("UPDATE user_reports SET status = 'open' WHERE status IS NULL OR status = ''"))


ensure_schema()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class SensorReadingOut(BaseModel):
    id: int
    timestamp: datetime
    location: str
    atrium_temp: float
    outdoor_temp: float
    noise_db: float
    brightness_lux: float
    humidity_pct: float

    class Config:
        from_attributes = True


class ReadingOut(BaseModel):
    id: int
    measured_at: datetime
    location: str
    temperature: float
    brightness: Optional[str] = None
    noise: Optional[str] = None

    class Config:
        from_attributes = True


class SummaryOut(BaseModel):
    min_temp: float
    max_temp: float
    avg_temp: float
    reading_count: int


class ComfortScores(BaseModel):
    study: int
    meeting: int
    relax: int
    overall: int
    status: str


class CurrentConditionsOut(BaseModel):
    reading: SensorReadingOut
    temperature_diff: float
    scores: ComfortScores
    advisories: List[str]


class ReportCreate(BaseModel):
    category: str = Field(..., description=f"One of {REPORT_CATEGORIES}")
    location: str = "Main Atrium"
    description: Optional[str] = Field(None, min_length=1)
    comment: Optional[str] = Field(None, min_length=1)
    status: str = Field("open", description=f"One of {REPORT_STATUSES}")
    author: Optional[str] = "Anonymous"

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: str):
        if value not in REPORT_CATEGORIES:
            raise ValueError(f"category must be one of {REPORT_CATEGORIES}")
        return value

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str):
        if value not in REPORT_STATUSES:
            raise ValueError(f"status must be one of {REPORT_STATUSES}")
        return value

    @model_validator(mode="after")
    def require_comment(self):
        if not self.description and self.comment:
            self.description = self.comment
        if not self.description:
            raise ValueError("comment or description is required.")
        return self


class ReportUpdate(BaseModel):
    category: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = Field(None, min_length=1)
    comment: Optional[str] = Field(None, min_length=1)
    status: Optional[str] = None
    author: Optional[str] = None

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: Optional[str]):
        if value is not None and value not in REPORT_CATEGORIES:
            raise ValueError(f"category must be one of {REPORT_CATEGORIES}")
        return value

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: Optional[str]):
        if value is not None and value not in REPORT_STATUSES:
            raise ValueError(f"status must be one of {REPORT_STATUSES}")
        return value

    @model_validator(mode="after")
    def require_at_least_one_field(self):
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided.")
        if not self.description and self.comment:
            self.description = self.comment
        return self


class ReportOut(BaseModel):
    id: int
    created_at: datetime
    timestamp: datetime
    category: str
    location: str
    comment: str
    description: str
    status: str
    author: str

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Comfort scoring logic (shared by live + history endpoints)
# ---------------------------------------------------------------------------
def clamp(v: float, lo: float = 5, hi: float = 100) -> int:
    return int(max(lo, min(hi, round(v))))


def compute_scores(atrium_temp: float, noise_db: float, brightness_lux: float):
    study = clamp(100 - abs(atrium_temp - 21) * 6 - max(0, noise_db - 40) * 1.1)
    meeting = clamp(100 - abs(atrium_temp - 22) * 5 - max(0, noise_db - 55) * 1.3)
    relax = clamp(100 - abs(atrium_temp - 23) * 4 - max(0, noise_db - 50) * 0.8 - max(0, brightness_lux - 600) * 0.05)
    overall = clamp((study + meeting + relax) / 3)

    if overall >= 85:
        status = "Excellent for Study"
    elif overall >= 70:
        status = "Good for Meetings"
    elif overall >= 55:
        status = "Comfortable"
    elif overall >= 40:
        status = "Too Noisy"
    else:
        status = "Too Warm"

    return ComfortScores(study=study, meeting=meeting, relax=relax, overall=overall, status=status)


def build_advisories(atrium_temp, outdoor_temp, noise_db, scores: ComfortScores) -> List[str]:
    advisories = []
    diff = round(outdoor_temp - atrium_temp, 1)
    if scores.study >= 80:
        advisories.append("Current conditions are excellent for studying.")
    if diff >= 8:
        advisories.append(f"Atrium is {diff}°C cooler than outside — a great escape from the heat.")
    if noise_db > 50:
        advisories.append("Noise levels are rising — consider Study Pods or the Library Hall.")
    else:
        advisories.append("Noise levels typically increase after 14:00 near the cafe seating.")
    if scores.meeting >= 75:
        advisories.append("Meeting conditions are currently optimal in the Main Atrium.")
    advisories.append("Best study time today: 09:00–11:30.")
    return advisories


def clamp_float(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def brightness_label(lux: float) -> str:
    if lux < 150:
        return "Dark"
    if lux < 300:
        return "Dim"
    if lux < 520:
        return "Normal brightness"
    if lux < 750:
        return "Bright"
    return "Very bright"


def noise_label(db_value: float) -> str:
    if db_value < 40:
        return "Quiet"
    if db_value < 55:
        return "Mild noise"
    if db_value < 68:
        return "Noisy"
    return "Very noisy"


def create_live_reading(db: Session, location: str = "Main Atrium") -> SensorReading:
    base = (
        db.query(SensorReading)
        .filter(SensorReading.location == location)
        .order_by(SensorReading.timestamp.desc())
        .first()
    )
    if not base:
        base = db.query(SensorReading).order_by(SensorReading.timestamp.desc()).first()
    if not base:
        raise HTTPException(status_code=404, detail="No sensor data available yet.")

    now = datetime.utcnow()
    minute_wave = math.sin((now.minute / 60) * math.pi * 2)
    atrium_temp = round(clamp_float(base.atrium_temp + random.uniform(-0.35, 0.35) + minute_wave * 0.08, 18.0, 34.0), 1)
    outdoor_temp = round(clamp_float(base.outdoor_temp + random.uniform(-0.45, 0.45) + minute_wave * 0.12, 10.0, 42.0), 1)
    noise_db = round(clamp_float(base.noise_db + random.uniform(-3.0, 3.0), 28.0, 78.0), 1)
    brightness_lux = round(clamp_float(base.brightness_lux + random.uniform(-55.0, 55.0), 60.0, 900.0), 1)
    humidity_pct = round(clamp_float(base.humidity_pct + random.uniform(-1.2, 1.2), 25.0, 65.0), 1)

    live = SensorReading(
        timestamp=now,
        location=location,
        atrium_temp=atrium_temp,
        outdoor_temp=outdoor_temp,
        noise_db=noise_db,
        brightness_lux=brightness_lux,
        humidity_pct=humidity_pct,
    )
    db.add(live)
    db.add(Reading(
        measured_at=now,
        location="atrium",
        temperature=atrium_temp,
        brightness=brightness_label(brightness_lux),
        noise=noise_label(noise_db),
    ))
    db.add(Reading(
        measured_at=now,
        location="outside",
        temperature=outdoor_temp,
        brightness=None,
        noise=None,
    ))
    db.commit()
    db.refresh(live)
    return live


# ---------------------------------------------------------------------------
# Seed data on first run
# ---------------------------------------------------------------------------
def parse_datetime(value) -> datetime:
    if isinstance(value, datetime):
        return value
    if not value:
        return datetime.utcnow()
    text = str(value).replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text).replace(tzinfo=None)
    except ValueError:
        return datetime.strptime(str(value), "%Y-%m-%d %H:%M:%S")


def pick(record: dict, *keys, default=None):
    for key in keys:
        if key in record and record[key] is not None:
            return record[key]
    return default


def plain_text(value) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "".join(part if isinstance(part, str) else str(part.get("text", "")) for part in value)
    return ""


def parse_telegram_reading(item: dict, measured_at: datetime) -> Optional[dict]:
    text = plain_text(pick(item, "text", default=""))
    if not text:
        entities = pick(item, "text_entities", default=[])
        text = " ".join(entity.get("text", "") for entity in entities if isinstance(entity, dict))

    temp_match = re.search(r"([-+]?\d+(?:[.,]\d+)?)\s*[°º]?\s*C", text, flags=re.IGNORECASE)
    if not temp_match:
        return None

    is_outside = "Outside" in text or "Outside NU" in text
    is_atrium = "Atrium" in text
    if not is_outside and not is_atrium:
        return None

    brightness = None
    noise = None
    if is_atrium:
        brightness_match = re.search(r"(Very bright|Normal brightness|Bright|Dim|Dark)", text, flags=re.IGNORECASE)
        noise_match = re.search(r"(Very noisy|Mild noise|Noisy|Quiet)", text, flags=re.IGNORECASE)
        brightness = brightness_match.group(1).title().replace("Normal Brightness", "Normal brightness") if brightness_match else None
        noise = noise_match.group(1).title().replace("Mild Noise", "Mild noise").replace("Very Noisy", "Very noisy") if noise_match else None

    return {
        "measured_at": measured_at,
        "location": "outside" if is_outside else "atrium",
        "temperature": float(temp_match.group(1).replace(",", ".")),
        "brightness": brightness,
        "noise": noise,
    }


def normalize_result_records(payload) -> list[dict]:
    if isinstance(payload, dict):
        for key in ("readings", "data", "results", "items", "messages"):
            if isinstance(payload.get(key), list):
                payload = payload[key]
                break
        else:
            payload = [payload]
    if not isinstance(payload, list):
        raise ValueError("result.json must contain a list or an object with readings/data/results/items.")

    rows: list[dict] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        measured_at = parse_datetime(pick(item, "measured_at", "timestamp", "date", "time", "datetime"))

        telegram_row = parse_telegram_reading(item, measured_at)
        if telegram_row:
            rows.append(telegram_row)
            continue

        explicit_location = pick(item, "location")
        if explicit_location:
            location = str(explicit_location).strip().lower()
            if location not in {"atrium", "outside"}:
                location = "atrium" if "atrium" in location else "outside"
            rows.append({
                "measured_at": measured_at,
                "location": location,
                "temperature": float(pick(item, "temperature", "temp", "atrium_temp", "outside_temp", "outdoor_temp")),
                "brightness": pick(item, "brightness", "brightness_lux", "light"),
                "noise": pick(item, "noise", "noise_db"),
            })
            continue

        atrium_temp = pick(item, "atrium_temp", "atrium_temperature", "temperature")
        outside_temp = pick(item, "outside_temp", "outdoor_temp", "outside_temperature")
        if atrium_temp is not None:
            rows.append({
                "measured_at": measured_at,
                "location": "atrium",
                "temperature": float(atrium_temp),
                "brightness": pick(item, "brightness", "brightness_lux", "light"),
                "noise": pick(item, "noise", "noise_db"),
            })
        if outside_temp is not None:
            rows.append({
                "measured_at": measured_at,
                "location": "outside",
                "temperature": float(outside_temp),
                "brightness": None,
                "noise": None,
            })
    return rows


def find_result_json() -> Optional[Path]:
    return next((path for path in RESULT_JSON_CANDIDATES if path.exists()), None)


def import_result_json(db: Session, path: Optional[Path] = None) -> int:
    source = path or find_result_json()
    if not source:
        return 0
    payload = json.loads(source.read_text(encoding="utf-8"))
    rows = normalize_result_records(payload)
    for row in rows:
        db.add(Reading(**row))
    db.commit()
    return len(rows)


def brightness_to_lux(value) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    return {
        "dark": 80.0,
        "dim": 180.0,
        "normal brightness": 420.0,
        "normal": 420.0,
        "bright": 650.0,
        "very bright": 850.0,
    }.get(str(value).strip().lower(), 420.0)


def noise_to_db(value) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    return {
        "quiet": 34.0,
        "mild noise": 48.0,
        "mild": 48.0,
        "noisy": 62.0,
        "very noisy": 74.0,
    }.get(str(value).strip().lower(), 45.0)


def seed_sensor_rows_from_readings(db: Session):
    if db.query(SensorReading).count() > 0:
        return
    atrium_rows = (
        db.query(Reading)
        .filter(Reading.location == "atrium")
        .order_by(Reading.measured_at.asc())
        .all()
    )
    for atrium in atrium_rows:
        outside = (
            db.query(Reading)
            .filter(Reading.location == "outside", Reading.measured_at == atrium.measured_at)
            .first()
        )
        db.add(SensorReading(
            timestamp=atrium.measured_at,
            location="Main Atrium",
            atrium_temp=atrium.temperature,
            outdoor_temp=outside.temperature if outside else atrium.temperature,
            noise_db=noise_to_db(atrium.noise),
            brightness_lux=brightness_to_lux(atrium.brightness),
            humidity_pct=40.0,
        ))
    db.commit()


def seed_readings_from_sensor_rows(db: Session):
    if db.query(Reading).count() > 0:
        return
    rows = db.query(SensorReading).order_by(SensorReading.timestamp.asc()).all()
    for row in rows:
        db.add(Reading(
            measured_at=row.timestamp,
            location="atrium",
            temperature=row.atrium_temp,
            brightness=str(row.brightness_lux) if row.brightness_lux is not None else None,
            noise=str(row.noise_db) if row.noise_db is not None else None,
        ))
        db.add(Reading(
            measured_at=row.timestamp,
            location="outside",
            temperature=row.outdoor_temp,
            brightness=None,
            noise=None,
        ))
    db.commit()


def seed_if_empty(db: Session):
    if db.query(Reading).count() == 0:
        import_result_json(db)
    if db.query(Reading).count() == 0 and db.query(SensorReading).count() > 0:
        seed_readings_from_sensor_rows(db)
    if db.query(Reading).count() > 0:
        seed_sensor_rows_from_readings(db)

    if db.query(SensorReading).count() > 0:
        return
    now = datetime.utcnow()
    random.seed(42)
    for day in range(7):
        for hour in range(0, 24, 1):
            ts = now - timedelta(days=day, hours=(23 - hour))
            wave = math.sin(((hour - 6) / 24) * math.pi * 2)
            atrium = round(22.5 + wave * 2.2 + random.uniform(-0.5, 0.5), 1)
            outdoor = round(30 + wave * 6 + random.uniform(-1, 1), 1)
            noise = max(28, round(42 + wave * 18 + random.uniform(-4, 4)))
            light = max(80, round(420 + wave * 260 + random.uniform(-40, 40)))
            humidity = round(38 + random.uniform(-6, 6), 1)
            db.add(SensorReading(
                timestamp=ts,
                location=random.choice(LOCATIONS),
                atrium_temp=atrium,
                outdoor_temp=outdoor,
                noise_db=noise,
                brightness_lux=light,
                humidity_pct=humidity,
            ))
            db.add(Reading(
                measured_at=ts,
                location="atrium",
                temperature=atrium,
                brightness="Bright" if light >= 600 else "Normal brightness",
                noise="Noisy" if noise >= 55 else "Quiet",
            ))
            db.add(Reading(
                measured_at=ts,
                location="outside",
                temperature=outdoor,
                brightness=None,
                noise=None,
            ))
    seed_reports = [
        ("Too Noisy", "Main Atrium", "Loud group near the east escalators around lunch.", "Aigerim K."),
        ("Comfortable", "Study Pods", "Perfect temperature and quiet — great for focused work.", "Daniyar S."),
        ("Too Bright", "Library Hall", "Direct sunlight through the skylight makes screens hard to read.", "Madina Y."),
        ("Too Hot", "East Wing", "HVAC seems off near the cafe seating.", "Anonymous"),
        ("Comfortable", "Main Atrium", "Nice and calm before 10am.", "Yerlan B."),
    ]
    for category, location, description, author in seed_reports:
        db.add(Report(category=category, location=location, description=description, author=author))
    db.commit()


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="AtriumIQ API", description="Smart Comfort Analytics for Nazarbayev University", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    db = SessionLocal()
    seed_if_empty(db)
    db.close()


@app.get("/")
def root():
    return {"service": "AtriumIQ API", "status": "online", "docs": "/docs"}


# ---------------------------------------------------------------------------
# Live conditions
# ---------------------------------------------------------------------------
@app.get("/api/current", response_model=CurrentConditionsOut)
def get_current_conditions(location: str = "Main Atrium", db: Session = Depends(get_db)):
    latest = create_live_reading(db, location)

    scores = compute_scores(latest.atrium_temp, latest.noise_db, latest.brightness_lux)
    advisories = build_advisories(latest.atrium_temp, latest.outdoor_temp, latest.noise_db, scores)
    diff = round(latest.outdoor_temp - latest.atrium_temp, 1)

    return CurrentConditionsOut(
        reading=SensorReadingOut.model_validate(latest),
        temperature_diff=diff,
        scores=scores,
        advisories=advisories,
    )


@app.get("/api/readings", response_model=List[ReadingOut])
def list_readings(
    location: Optional[str] = Query(None, pattern="^(atrium|outside)$"),
    limit: int = 200,
    db: Session = Depends(get_db),
):
    q = db.query(Reading)
    if location:
        q = q.filter(Reading.location == location)
    return q.order_by(Reading.measured_at.desc()).limit(limit).all()


@app.get("/api/readings/{reading_id}", response_model=ReadingOut)
def get_reading(reading_id: int, db: Session = Depends(get_db)):
    reading = db.query(Reading).filter(Reading.id == reading_id).first()
    if not reading:
        raise HTTPException(status_code=404, detail="Reading not found.")
    return reading


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------
@app.get("/api/analytics/trend")
def get_trend(hours: int = 24, location: Optional[str] = None, db: Session = Depends(get_db)):
    since = datetime.utcnow() - timedelta(hours=hours)
    q = db.query(SensorReading).filter(SensorReading.timestamp >= since)
    if location:
        q = q.filter(SensorReading.location == location)
    rows = q.order_by(SensorReading.timestamp.asc()).all()
    return [
        {
            "timestamp": r.timestamp,
            "atrium": r.atrium_temp,
            "outdoor": r.outdoor_temp,
            "noise": r.noise_db,
            "light": r.brightness_lux,
            "diff": round(r.outdoor_temp - r.atrium_temp, 1),
        }
        for r in rows
    ]


@app.get("/api/summary", response_model=SummaryOut)
@app.get("/api/analytics/summary", response_model=SummaryOut)
def get_summary(db: Session = Depends(get_db)):
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    rows = db.query(SensorReading).filter(SensorReading.timestamp >= today_start).all()
    if not rows:
        raise HTTPException(status_code=404, detail="No readings for today yet.")
    temps = [r.atrium_temp for r in rows]
    return {
        "min_temp": round(min(temps), 1),
        "max_temp": round(max(temps), 1),
        "avg_temp": round(sum(temps) / len(temps), 1),
        "reading_count": len(rows),
    }


# ---------------------------------------------------------------------------
# History (filterable, sortable)
# ---------------------------------------------------------------------------
@app.get("/api/history", response_model=List[SensorReadingOut])
def get_history(
    location: Optional[str] = None,
    date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    min_temp: Optional[float] = None,
    max_temp: Optional[float] = None,
    max_noise: Optional[float] = None,
    max_brightness: Optional[float] = None,
    sort_by: str = Query("timestamp", pattern="^(timestamp|atrium_temp|noise_db|brightness_lux)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = 100,
    db: Session = Depends(get_db),
):
    q = db.query(SensorReading)
    if location:
        q = q.filter(SensorReading.location == location)
    if date:
        day_start = datetime.strptime(date, "%Y-%m-%d")
        q = q.filter(SensorReading.timestamp >= day_start, SensorReading.timestamp < day_start + timedelta(days=1))
    if min_temp is not None:
        q = q.filter(SensorReading.atrium_temp >= min_temp)
    if max_temp is not None:
        q = q.filter(SensorReading.atrium_temp <= max_temp)
    if max_noise is not None:
        q = q.filter(SensorReading.noise_db <= max_noise)
    if max_brightness is not None:
        q = q.filter(SensorReading.brightness_lux <= max_brightness)

    col = getattr(SensorReading, sort_by)
    q = q.order_by(col.asc() if order == "asc" else col.desc())
    return q.limit(limit).all()


# ---------------------------------------------------------------------------
# Reports CRUD
# ---------------------------------------------------------------------------
@app.get("/api/reports", response_model=List[ReportOut])
def list_reports(category: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Report)
    if category:
        q = q.filter(Report.category == category)
    return q.order_by(Report.timestamp.desc()).all()


@app.post("/api/reports", response_model=ReportOut, status_code=201)
def create_report(report: ReportCreate, db: Session = Depends(get_db)):
    obj = Report(**report.model_dump(exclude={"comment"}))
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@app.get("/api/reports/{report_id}", response_model=ReportOut)
def get_report(report_id: int, db: Session = Depends(get_db)):
    obj = db.query(Report).filter(Report.id == report_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Report not found.")
    return obj


def apply_report_patch(report_id: int, patch: ReportUpdate, db: Session):
    obj = db.query(Report).filter(Report.id == report_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Report not found.")
    updates = patch.model_dump(exclude_unset=True, exclude={"comment"})
    if "comment" in patch.model_fields_set and patch.comment is not None:
        updates["description"] = patch.comment
    for field, value in updates.items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return obj


@app.put("/api/reports/{report_id}", response_model=ReportOut)
def update_report(report_id: int, patch: ReportUpdate, db: Session = Depends(get_db)):
    return apply_report_patch(report_id, patch, db)


@app.patch("/api/reports/{report_id}", response_model=ReportOut)
def patch_report(report_id: int, patch: ReportUpdate, db: Session = Depends(get_db)):
    return apply_report_patch(report_id, patch, db)


@app.delete("/api/reports/{report_id}", status_code=204)
def delete_report(report_id: int, db: Session = Depends(get_db)):
    obj = db.query(Report).filter(Report.id == report_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Report not found.")
    db.delete(obj)
    db.commit()


# ---------------------------------------------------------------------------
# Community mood
# ---------------------------------------------------------------------------
@app.get("/api/community-mood")
def get_community_mood(db: Session = Depends(get_db)):
    reports = db.query(Report).all()
    total = len(reports) or 1
    counts = {c: 0 for c in REPORT_CATEGORIES}
    for r in reports:
        counts[r.category] = counts.get(r.category, 0) + 1
    comfortable = counts.get("Comfortable", 0)
    satisfaction = round((comfortable / total) * 100)
    top_complaint = max(
        ((k, v) for k, v in counts.items() if k != "Comfortable"),
        key=lambda kv: kv[1],
        default=("None", 0),
    )
    return {
        "total_reports": len(reports),
        "satisfaction_rate": satisfaction,
        "category_breakdown": counts,
        "top_complaint": top_complaint[0],
    }


# ---------------------------------------------------------------------------
# Locations metadata
# ---------------------------------------------------------------------------
@app.get("/api/locations")
def get_locations():
    return {"locations": LOCATIONS, "report_categories": REPORT_CATEGORIES}

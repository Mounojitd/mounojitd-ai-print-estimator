import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api import estimate
from .routers import masters, quotations

app = FastAPI(
    title="AI Print Estimator API",
    version="1.0.0",
    description="V1 cost-estimation API for print quotations.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(estimate.router)
app.include_router(masters.router)
app.include_router(quotations.router)

_STATIC = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=_STATIC), name="static")


@app.get("/", include_in_schema=False)
def home():
    """The Create-Estimate page (the link NKK sir wanted)."""
    return FileResponse(os.path.join(_STATIC, "index.html"))


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}

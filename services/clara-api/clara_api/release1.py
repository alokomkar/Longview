"""Production entry point for the read-only Ask Clara release."""

from .main import create_app


app = create_app(release_mode="read-only")

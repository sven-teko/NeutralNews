from flask import Flask, render_template
from feeds import feeds_bp

# Templates liegen in "web", statische Assets (styles.css, news.js) ebenso.
app = Flask(
    __name__,
    template_folder="web",
    static_folder="web",
    static_url_path="/static",
)

# API-Blueprint registrieren
app.register_blueprint(feeds_bp)

# Startseite: rendert index.html; Inhalte lädt das Frontend über /api/feeds
@app.route("/")
def index():
    return render_template("index.html")

if __name__ == "__main__":
    app.run(debug=True)

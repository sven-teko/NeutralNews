from flask import Flask, render_template
from feeds import feeds_bp

# Templates
app = Flask(
    __name__,
    template_folder="web",
    static_folder="web",
    static_url_path="/static",
)

# API registrieren
app.register_blueprint(feeds_bp)

# Startseite
@app.route("/")
def index():
    return render_template("index.html")

if __name__ == "__main__":
    app.run(debug=True)

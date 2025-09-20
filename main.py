from flask import Flask, render_template
import rss_client

app = Flask(__name__, template_folder="web")

@app.route("/")
def index():
    left  = rss_client.fetch("nzz", limit=10)
    right = rss_client.fetch("spiegel", limit=10)
    return render_template("index.html", left_items=left, right_items=right)

if __name__ == "__main__":
    app.run(debug=True)

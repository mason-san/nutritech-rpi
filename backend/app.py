from flask import Flask, send_from_directory
from flask_cors import CORS 
import os
from routes.tubs import tubs_bp 
from routes.experiments import experiments_bp 

def create_app():
    app = Flask(__name__, static_folder="../frontend/nutritech-dashboard/dist", static_url_path="")
    CORS(app)

    @app.route("/")
    def index():
        return send_from_directory(app.static_folder, "index.html")
    
    @app.route("/<path:path>")
    def static_proxy(path):
        file_path = os.path.join(app.static_folder, path)

        if os.path.exists(file_path):
            return send_from_directory(app.static_folder, path)
        
        return send_from_directory(app.static_folder, "index.html")

    app.register_blueprint(tubs_bp, url_prefix="/api/tubs")
    app.register_blueprint(experiments_bp, url_prefix="/api/experiments")

    return app

if __name__ == "__main__":
    app = create_app()
    app.run(debug=True)
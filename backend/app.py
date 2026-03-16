from flask import Flask, send_from_directory
from flask_cors import CORS 
import os
from routes.tubs import tubs_bp 
from routes.experiments import experiments_bp 

def create_app():
    """
    Application factory function to initialize the Flask app.
    It configures the static folder for serving the built React frontend,
    enables CORS, and registers the API blueprints.
    """
    app = Flask(__name__, static_folder="../frontend/nutritech-dashboard/dist", static_url_path="")
    
    # Enable Cross-Origin Resource Sharing for all routes
    CORS(app)

    @app.route("/")
    def index():
        """Serves the main index.html for the React frontend."""
        return send_from_directory(app.static_folder, "index.html")
    
    @app.route("/<path:path>")
    def static_proxy(path):
        """
        Proxies static file requests. If the file exists in the build folder, serve it.
        Otherwise, return index.html to allow React Router to handle client-side routing.
        """
        file_path = os.path.join(app.static_folder, path)

        if os.path.exists(file_path):
            return send_from_directory(app.static_folder, path)
        
        return send_from_directory(app.static_folder, "index.html")

    # Register blueprints (modular routes) for Tubs and Experiments
    app.register_blueprint(tubs_bp, url_prefix="/api/tubs")
    app.register_blueprint(experiments_bp, url_prefix="/api/experiments")

    return app

if __name__ == "__main__":
    # Create the app and run it in debug mode (auto-reloads on changes)
    app = create_app()
    app.run(debug=True)
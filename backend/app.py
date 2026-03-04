from flask import Flask 
from flask_cors import CORS 

from routes.tubs import tubs_bp 
from routes.experiments import experiments_bp 

def create_app():
    app = Flask(__name__)
    CORS(app)

    app.register_blueprint(tubs_bp, url_prefix="/api/tubs")
    app.register_blueprint(experiments_bp, url_prefix="/api/experiments")

    return app

if __name__ == "__main__":
    app = create_app()
    app.run(debug=True)
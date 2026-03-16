"""
    API Routes for Tubs
    This module handles fetching tub information and their associated configurations.
    - Fetching all tubs.
    - Fetching details and configuration for a specific tub.
"""
from flask import Blueprint, jsonify
from services.supabase_service import supabase

# Create a Blueprint for tub-related routes
tubs_bp = Blueprint("tubs", __name__)

@tubs_bp.route("/", methods=["GET"])
def get_all_tubs():
    """
    GET /api/tubs/
    Fetches all tub records from the 'tubs' table in the 'experiment' schema.
    """

    try: 
        # Query Supabase for all records in the experiment.tubs table
        response = (
            supabase
            .schema("experiment")
            .table("tubs")
            .select("*")
            .execute()
        )

        return jsonify({
            "status" : "success",
            "data" : response.data 
        })
    except Exception as e:
        return jsonify({
            "status" : "error",
            "message" : str(e)
        }), 500
    
@tubs_bp.route("/<int:tub_id>", methods=["GET"])
def get_particular_tub_details(tub_id):
    """
    GET /api/tubs/<id>
    Fetches details for a single tub and joins its configuration information.
    Configuration includes thresholds, soil types, and other settings.
    """
    try:
        # 1. Fetch core tub metadata (label, plant type, etc.)
        tub_res = (
            supabase
            .schema("experiment")
            .table("tubs")
            .select("*")
            .eq("id", tub_id)
            .single()
            .execute()
        )

        if not tub_res.data:
            return jsonify({
                "status" : "error", 
                "message" : "Tub not found"
            }), 404
        
        tub_data = tub_res.data

        # 2. Fetch configuration settings for this specific tub
        config_res = (
            supabase
            .schema("experiment")
            .table("tub_config")
            .select("*")
            .eq("tub_id", tub_id)
            .execute()
        )

        # Use the first config record if it exists, otherwise return null
        config_data = config_res.data[0] if config_res.data else None

        return jsonify({
            "status" : "success",
            "tub" : tub_data, 
            "config" : config_data
        })
    except Exception as e:
        return jsonify({
            "status" : "error",
            "message" : str(e)
        }), 500

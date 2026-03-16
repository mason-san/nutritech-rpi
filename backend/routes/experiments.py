"""
    API Routes for Experiments
    This module handles all operations related to experiment data stored in Supabase.
    - Fetching all experiments.
    - Fetching details for a specific experiment, including its associated tubs.
"""

from flask import Blueprint, jsonify, request
from services.supabase_service import supabase 
from datetime import datetime, timedelta

# Create a Blueprint for experiment routes
experiments_bp = Blueprint("experiments", __name__)

@experiments_bp.route("/", methods=["GET"])
def get_app_experiments():
    """
    GET /api/experiments/
    Fetches a list of all experiments from the 'experiments' table in the 'experiment' schema.
    Returns: JSON response containing experiment data sorted by start date.
    """

    try: 
        # Query Supabase: schema 'experiment', table 'experiments', sorted descending by 'started_at'
        response = (
            supabase
            .schema("experiment")
            .table("experiments")
            .select("*")
            .order("started_at", desc=True)
            .execute()
        )

        return jsonify({
            "status" : "success",
            "data" : response.data
        })
    except Exception as e:
        # Handle unexpected errors
        return jsonify({
            "message" : "error",
            "message" : str(e)
        }), 500
    
@experiments_bp.route("/<int:experiment_id>", methods=["GET"])
def get_experiment_details(experiment_id):
    """
    GET /api/experiments/<id>
    Fetches detailed information for a single experiment, including:
    1. Basic experiment metadata.
    2. The list of Tubs (buckets) mapped to this experiment ID.
    """

    try: 
        # 1. Fetch core experiment details
        experiment_res = (
            supabase
            .schema("experiment")
            .table("experiments")
            .select("*")
            .eq("id", experiment_id)
            .single()
            .execute()
        )

        if not experiment_res.data:
            return jsonify({
                "status" : "error",
                "message" : "Experiment not found"
            }), 404
        
        experiment_data = experiment_res.data

        # 2. Fetch tub_ids from the 'mapping' table that link experiments to tubs
        mapping_res = (
            supabase
            .schema("experiment")
            .table("mapping")
            .select("tub_id")
            .eq("experiment_id", experiment_id)
            .execute()
        )

        # Extract only the tub_id values into a list
        tub_ids = [row['tub_id'] for row in mapping_res.data]

        tubs_data = []
        # 3. If there are mapped tubs, fetch their detailed records from the 'tubs' table
        if tub_ids:
            tubs_res = (
                supabase
                .schema("experiment")
                .table('tubs')
                .select('*')
                .in_("id", tub_ids)
                .execute()
            )

            tubs_data = tubs_res.data
        
        # Combine everything into one final response
        return jsonify({
            "status" : "success",
            "experiment" : experiment_data,
            "tubs" : tubs_data
        })
    
    except Exception as e:
        return jsonify({
            "status" : "error",
            "message" : str(e)
        }), 500

    

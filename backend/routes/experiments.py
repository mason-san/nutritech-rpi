"""
    MAIN PAGE FOR LOADING ALL EXPERIMENTS RELATED DATA FROM SUPABASE
    1. GET all experiments stored in supabase  
    2. get particular experiment stored in supabase by their id.
"""

from flask import Blueprint, jsonify, request
from services.supabase_service import supabase 
from datetime import datetime, timedelta

experiments_bp = Blueprint("experiments", __name__)

@experiments_bp.route("/", methods=["GET"])
def get_app_experiments():
    """This route loads all experiments stored in the supabase"""

    try: 
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
        return jsonify({
            "message" : "error",
            "message" : str(e)
        }), 500
    
@experiments_bp.route("/<int:experiment_id>", methods=["GET"])
def get_experiment_details(experiment_id):
    """This route is used to get the experiment details of a single experiment by their id"""

    try: 
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

        #Get  tub  ids from mapping table 
        mapping_res = (
            supabase
            .schema("experiment")
            .table("mapping")
            .select("tub_id")
            .eq("experiment_id", experiment_id)
            .execute()
        )

        tub_ids = [row['tub_id'] for row in mapping_res.data]

        tubs_data = []
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
    

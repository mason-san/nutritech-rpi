"""
    ALL ROUTES RELATED TO TUBS IS HERE 

    1. fetch all available tubs to frontend from the backend
    2.  fetch particular tubs using their ID and display config details too 
    3. 

"""
from flask import Blueprint, jsonify
from services.supabase_service import supabase

tubs_bp = Blueprint("tubs", __name__)

@tubs_bp.route("/", methods=["GET"])
def get_all_tubs():
    """ROUTE TO FETCH ALL TUBS TO FRONTEND FROM THE SUPABASE DATABASE"""

    try: 
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
    """Route to fetch one single tub from supabase"""
    try:
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

        config_res = (
            supabase
            .schema("experiment")
            .table("tub_config")
            .select("*")
            .eq("tub_id", tub_id)
            .execute()
        )

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

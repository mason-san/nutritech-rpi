
erDiagram
    %% Core Infrastructure
    EXPERIMENTS ||--o{ MAPPING : "includes"
    TUBS ||--o{ MAPPING : "assigned to"
    EXPERIMENTS ||--o{ TUBS : "configures (direct)"
    
    TUBS ||--o{ SENSOR_DATA : "generates"
    TUBS ||--o{ SENSOR_STATUS : "monitors"
    
    %% ML & Optimization (The "Intelligence" Layer)
    TUBS ||--o{ PROCESSED_READINGS : "feature extraction"
    TUBS ||--o{ COMPUTED_SCORES : "inference"
    TUBS ||--o{ SENSOR_SIGNALS : "tactical optimization"
    
    %% NEW / PROPOSED TABLES
    TUBS ||--|| TUB_OPTIMAL_VALUES : "defines targets"
    TUBS ||--o{ ANOMALY_LOGS : "detects drift"

    EXPERIMENTS {
        int id PK
        string title
        string description
        timestamp started_at
        timestamp ended_at
        string status "active/completed"
    }

    TUBS {
        int id PK
        string label "Tub Name (e.g. Tub 3 Blue)"
        string plant_name
        string soil_type
        int experiment_id FK
    }

    SENSOR_DATA {
        int id PK
        int tub_id FK
        timestamp created_at
        float soil_ph
        float soil_moisture
        float soil_temp
        float nitrogen
        float phosphorus
        float potassium
    }

    TUB_OPTIMAL_VALUES {
        int id PK
        int tub_id FK "Must be per-tub since plant/soil vary"
        float opt_moisture_min
        float opt_moisture_max
        float opt_ph_min
        float opt_ph_max
        float opt_nitrogen_target
        string notes "Rationale for these targets"
    }

    COMPUTED_SCORES {
        int id PK
        int tub_id FK
        timestamp timestamp
        float health_t "0.0 - 1.0"
        float risk_t "0.0 - 1.0"
        float stress_t "0.0 - 1.0"
    }

    SENSOR_SIGNALS {
        int id PK
        int tub_id FK
        string recommendation "e.g. Increase Nitrogen"
        string priority "CRITICAL/WARNING/STABLE"
        timestamp created_at
        boolean is_active
    }

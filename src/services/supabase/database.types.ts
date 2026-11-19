
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "assessment_requests": {
                  Row: {
                    "aircraft_models": string | null,"company": string,"consent_at": string,"country": string,"created_at": string,"email": string,"fleet_size": string,"full_name": string,"hosting": string,"id": string,"industry": string,"objectives": (string)[],"project_summary": string,"reference": string,"role_title": string,"services": (string)[],"source_ip_hash": string | null,"timeline": string,"trace_id": string | null,"triage_status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aircraft_models"?: string | null,"company": string,"consent_at": string,"country": string,"created_at"?: string,"email": string,"fleet_size": string,"full_name": string,"hosting": string,"id"?: string,"industry": string,"objectives": (string)[],"project_summary": string,"reference"?: string,"role_title": string,"services": (string)[],"source_ip_hash"?: string | null,"timeline": string,"trace_id"?: string | null,"triage_status"?: string
                  }
                  Update: {
                    "aircraft_models"?: string | null,"company"?: string,"consent_at"?: string,"country"?: string,"created_at"?: string,"email"?: string,"fleet_size"?: string,"full_name"?: string,"hosting"?: string,"id"?: string,"industry"?: string,"objectives"?: (string)[],"project_summary"?: string,"reference"?: string,"role_title"?: string,"services"?: (string)[],"source_ip_hash"?: string | null,"timeline"?: string,"trace_id"?: string | null,"triage_status"?: string
                  }
                  Relationships: [
                    
                  ]
                },"assets": {
                  Row: {
                    "code": string | null,"created_at": string,"id": string,"kind": Database["public"]['Enums']["asset_kind"],"lat": number | null,"lon": number | null,"name": string,"organization_id": string,"site_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code"?: string | null,"created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["asset_kind"],"lat"?: number | null,"lon"?: number | null,"name": string,"organization_id": string,"site_id": string,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string | null,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["asset_kind"],"lat"?: number | null,"lon"?: number | null,"name"?: string,"organization_id"?: string,"site_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assets_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assets_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"blade_captures": {
                  Row: {
                    "blade": Database["public"]['Enums']["blade_position"],"capture_id": string,"chord_length_mm": number | null,"face": Database["public"]['Enums']["blade_face"],"project_id": string,"radius_center_m": number | null,"sequence_direction": Database["public"]['Enums']["sequence_direction"]
                  }
                  ComputedFields: never
                  Insert: {
                    "blade": Database["public"]['Enums']["blade_position"],"capture_id": string,"chord_length_mm"?: number | null,"face": Database["public"]['Enums']["blade_face"],"project_id": string,"radius_center_m"?: number | null,"sequence_direction"?: Database["public"]['Enums']["sequence_direction"]
                  }
                  Update: {
                    "blade"?: Database["public"]['Enums']["blade_position"],"capture_id"?: string,"chord_length_mm"?: number | null,"face"?: Database["public"]['Enums']["blade_face"],"project_id"?: string,"radius_center_m"?: number | null,"sequence_direction"?: Database["public"]['Enums']["sequence_direction"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "blade_captures_capture_id_fkey"
      columns: ["capture_id"]
isOneToOne: true
      referencedRelation: "captures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "blade_captures_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"captures": {
                  Row: {
                    "alt_abs_m": number | null,"alt_rel_m": number | null,"camera_model": string | null,"captured_at": string | null,"created_at": string,"drone_model": string | null,"file_name": string,"gimbal_pitch_deg": number | null,"gimbal_roll_deg": number | null,"gimbal_yaw_deg": number | null,"gsd_confidence": Database["public"]['Enums']["confidence_level"] | null,"gsd_mm_px": number | null,"gsd_source": Database["public"]['Enums']["gsd_source"] | null,"height_px": number,"id": string,"inspection_id": string,"lat": number | null,"lon": number | null,"lrf_distance_m": number | null,"metadata": NonNullable<Json>,"original_path": string,"paired_capture_id": string | null,"preview_path": string | null,"project_id": string,"sequence_index": number | null,"sha256": string,"spectrum": Database["public"]['Enums']["spectrum"],"thumb_path": string | null,"updated_at": string,"width_px": number
                  }
                  ComputedFields: never
                  Insert: {
                    "alt_abs_m"?: number | null,"alt_rel_m"?: number | null,"camera_model"?: string | null,"captured_at"?: string | null,"created_at"?: string,"drone_model"?: string | null,"file_name": string,"gimbal_pitch_deg"?: number | null,"gimbal_roll_deg"?: number | null,"gimbal_yaw_deg"?: number | null,"gsd_confidence"?: Database["public"]['Enums']["confidence_level"] | null,"gsd_mm_px"?: number | null,"gsd_source"?: Database["public"]['Enums']["gsd_source"] | null,"height_px": number,"id"?: string,"inspection_id": string,"lat"?: number | null,"lon"?: number | null,"lrf_distance_m"?: number | null,"metadata"?: NonNullable<Json>,"original_path": string,"paired_capture_id"?: string | null,"preview_path"?: string | null,"project_id": string,"sequence_index"?: number | null,"sha256": string,"spectrum": Database["public"]['Enums']["spectrum"],"thumb_path"?: string | null,"updated_at"?: string,"width_px": number
                  }
                  Update: {
                    "alt_abs_m"?: number | null,"alt_rel_m"?: number | null,"camera_model"?: string | null,"captured_at"?: string | null,"created_at"?: string,"drone_model"?: string | null,"file_name"?: string,"gimbal_pitch_deg"?: number | null,"gimbal_roll_deg"?: number | null,"gimbal_yaw_deg"?: number | null,"gsd_confidence"?: Database["public"]['Enums']["confidence_level"] | null,"gsd_mm_px"?: number | null,"gsd_source"?: Database["public"]['Enums']["gsd_source"] | null,"height_px"?: number,"id"?: string,"inspection_id"?: string,"lat"?: number | null,"lon"?: number | null,"lrf_distance_m"?: number | null,"metadata"?: NonNullable<Json>,"original_path"?: string,"paired_capture_id"?: string | null,"preview_path"?: string | null,"project_id"?: string,"sequence_index"?: number | null,"sha256"?: string,"spectrum"?: Database["public"]['Enums']["spectrum"],"thumb_path"?: string | null,"updated_at"?: string,"width_px"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "captures_inspection_id_fkey"
      columns: ["inspection_id"]
isOneToOne: false
      referencedRelation: "inspections"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "captures_paired_capture_id_fkey"
      columns: ["paired_capture_id"]
isOneToOne: false
      referencedRelation: "captures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "captures_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"change_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"at": string,"id": number,"new": Json | null,"old": Json | null,"project_id": string,"row_id": string,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"at"?: string,"id"?: never,"new"?: Json | null,"old"?: Json | null,"project_id": string,"row_id": string,"table_name": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"at"?: string,"id"?: never,"new"?: Json | null,"old"?: Json | null,"project_id"?: string,"row_id"?: string,"table_name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"comments": {
                  Row: {
                    "author_id": string,"author_name": string,"body": string,"created_at": string,"edited_at": string | null,"finding_id": string | null,"id": string,"inspection_id": string,"project_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string,"author_name": string,"body": string,"created_at"?: string,"edited_at"?: string | null,"finding_id"?: string | null,"id"?: string,"inspection_id": string,"project_id": string
                  }
                  Update: {
                    "author_id"?: string,"author_name"?: string,"body"?: string,"created_at"?: string,"edited_at"?: string | null,"finding_id"?: string | null,"id"?: string,"inspection_id"?: string,"project_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_finding_id_fkey"
      columns: ["finding_id"]
isOneToOne: false
      referencedRelation: "findings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_inspection_id_fkey"
      columns: ["inspection_id"]
isOneToOne: false
      referencedRelation: "inspections"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"deletion_log": {
                  Row: {
                    "actor_id": string | null,"at": string,"bytes": number,"counts": NonNullable<Json>,"entity_id": string,"entity_type": string,"id": number,"kind": string,"name": string | null,"operation_id": string,"organization_id": string | null,"project_id": string | null,"reason": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"at"?: string,"bytes"?: number,"counts"?: NonNullable<Json>,"entity_id": string,"entity_type": string,"id"?: never,"kind": string,"name"?: string | null,"operation_id": string,"organization_id"?: string | null,"project_id"?: string | null,"reason"?: string | null,"status": string
                  }
                  Update: {
                    "actor_id"?: string | null,"at"?: string,"bytes"?: number,"counts"?: NonNullable<Json>,"entity_id"?: string,"entity_type"?: string,"id"?: never,"kind"?: string,"name"?: string | null,"operation_id"?: string,"organization_id"?: string | null,"project_id"?: string | null,"reason"?: string | null,"status"?: string
                  }
                  Relationships: [
                    
                  ]
                },"finding_types": {
                  Row: {
                    "code": string,"domain": Database["public"]['Enums']["inspection_kind"],"id": string,"is_active": boolean,"label_en": string,"label_es": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"domain": Database["public"]['Enums']["inspection_kind"],"id"?: string,"is_active"?: boolean,"label_en": string,"label_es": string
                  }
                  Update: {
                    "code"?: string,"domain"?: Database["public"]['Enums']["inspection_kind"],"id"?: string,"is_active"?: boolean,"label_en"?: string,"label_es"?: string
                  }
                  Relationships: [
                    
                  ]
                },"findings": {
                  Row: {
                    "ai_confidence": number | null,"ai_model": string | null,"ai_model_version": string | null,"ai_original": Json | null,"area_mm2": number | null,"capture_id": string | null,"client_reviewed_at": string | null,"client_reviewed_by": string | null,"corrected_at": string | null,"corrected_by": string | null,"created_at": string,"created_by": string | null,"delta_t_c": number | null,"gsd_mm_px_used": number | null,"id": string,"inspection_id": string,"length_mm": number | null,"max_temp_c": number | null,"mosaic_id": string | null,"notes": string | null,"project_id": string,"radius_m": number | null,"region": NonNullable<Json>,"severity": number,"source": Database["public"]['Enums']["finding_source"],"status": Database["public"]['Enums']["finding_status"],"type_id": string,"updated_at": string,"width_mm": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_confidence"?: number | null,"ai_model"?: string | null,"ai_model_version"?: string | null,"ai_original"?: Json | null,"area_mm2"?: number | null,"capture_id"?: string | null,"client_reviewed_at"?: string | null,"client_reviewed_by"?: string | null,"corrected_at"?: string | null,"corrected_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"delta_t_c"?: number | null,"gsd_mm_px_used"?: number | null,"id"?: string,"inspection_id": string,"length_mm"?: number | null,"max_temp_c"?: number | null,"mosaic_id"?: string | null,"notes"?: string | null,"project_id": string,"radius_m"?: number | null,"region": NonNullable<Json>,"severity": number,"source"?: Database["public"]['Enums']["finding_source"],"status"?: Database["public"]['Enums']["finding_status"],"type_id": string,"updated_at"?: string,"width_mm"?: number | null
                  }
                  Update: {
                    "ai_confidence"?: number | null,"ai_model"?: string | null,"ai_model_version"?: string | null,"ai_original"?: Json | null,"area_mm2"?: number | null,"capture_id"?: string | null,"client_reviewed_at"?: string | null,"client_reviewed_by"?: string | null,"corrected_at"?: string | null,"corrected_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"delta_t_c"?: number | null,"gsd_mm_px_used"?: number | null,"id"?: string,"inspection_id"?: string,"length_mm"?: number | null,"max_temp_c"?: number | null,"mosaic_id"?: string | null,"notes"?: string | null,"project_id"?: string,"radius_m"?: number | null,"region"?: NonNullable<Json>,"severity"?: number,"source"?: Database["public"]['Enums']["finding_source"],"status"?: Database["public"]['Enums']["finding_status"],"type_id"?: string,"updated_at"?: string,"width_mm"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "findings_capture_id_fkey"
      columns: ["capture_id"]
isOneToOne: false
      referencedRelation: "captures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "findings_client_reviewed_by_fkey"
      columns: ["client_reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "findings_corrected_by_fkey"
      columns: ["corrected_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "findings_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "findings_inspection_id_fkey"
      columns: ["inspection_id"]
isOneToOne: false
      referencedRelation: "inspections"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "findings_mosaic_id_fkey"
      columns: ["mosaic_id"]
isOneToOne: false
      referencedRelation: "mosaics"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "findings_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "findings_type_id_fkey"
      columns: ["type_id"]
isOneToOne: false
      referencedRelation: "finding_types"
      referencedColumns: ["id"]
    }
                  ]
                },"inspections": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"asset_id": string,"asset_lat": number | null,"asset_lon": number | null,"asset_position_source": string | null,"assistant_name": string | null,"blade_length_m": number | null,"created_at": string,"deleting_at": string | null,"drone_model": string | null,"id": string,"id_capture_id": string | null,"inspected_at": string | null,"kind": Database["public"]['Enums']["inspection_kind"],"notes": string | null,"pilot_name": string | null,"project_id": string,"status": Database["public"]['Enums']["inspection_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"asset_id": string,"asset_lat"?: number | null,"asset_lon"?: number | null,"asset_position_source"?: string | null,"assistant_name"?: string | null,"blade_length_m"?: number | null,"created_at"?: string,"deleting_at"?: string | null,"drone_model"?: string | null,"id"?: string,"id_capture_id"?: string | null,"inspected_at"?: string | null,"kind": Database["public"]['Enums']["inspection_kind"],"notes"?: string | null,"pilot_name"?: string | null,"project_id": string,"status"?: Database["public"]['Enums']["inspection_status"],"updated_at"?: string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"asset_id"?: string,"asset_lat"?: number | null,"asset_lon"?: number | null,"asset_position_source"?: string | null,"assistant_name"?: string | null,"blade_length_m"?: number | null,"created_at"?: string,"deleting_at"?: string | null,"drone_model"?: string | null,"id"?: string,"id_capture_id"?: string | null,"inspected_at"?: string | null,"kind"?: Database["public"]['Enums']["inspection_kind"],"notes"?: string | null,"pilot_name"?: string | null,"project_id"?: string,"status"?: Database["public"]['Enums']["inspection_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "inspections_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inspections_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: false
      referencedRelation: "assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inspections_id_capture_fk"
      columns: ["id_capture_id"]
isOneToOne: false
      referencedRelation: "captures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inspections_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"mosaics": {
                  Row: {
                    "blade": Database["public"]['Enums']["blade_position"] | null,"blade_length_m": number | null,"calibrated_at": string | null,"calibrated_by": string | null,"created_at": string,"face": Database["public"]['Enums']["blade_face"] | null,"format": Database["public"]['Enums']["mosaic_format"],"height_px": number,"id": string,"inspection_id": string,"kind": Database["public"]['Enums']["mosaic_kind"],"mm_per_px": number | null,"path": string,"project_id": string,"root_at_top": boolean | null,"root_row_px": number | null,"spectrum": Database["public"]['Enums']["spectrum"],"tip_row_px": number | null,"updated_at": string,"width_px": number
                  }
                  ComputedFields: never
                  Insert: {
                    "blade"?: Database["public"]['Enums']["blade_position"] | null,"blade_length_m"?: number | null,"calibrated_at"?: string | null,"calibrated_by"?: string | null,"created_at"?: string,"face"?: Database["public"]['Enums']["blade_face"] | null,"format"?: Database["public"]['Enums']["mosaic_format"],"height_px": number,"id"?: string,"inspection_id": string,"kind": Database["public"]['Enums']["mosaic_kind"],"mm_per_px"?: number | null,"path": string,"project_id": string,"root_at_top"?: boolean | null,"root_row_px"?: number | null,"spectrum": Database["public"]['Enums']["spectrum"],"tip_row_px"?: number | null,"updated_at"?: string,"width_px": number
                  }
                  Update: {
                    "blade"?: Database["public"]['Enums']["blade_position"] | null,"blade_length_m"?: number | null,"calibrated_at"?: string | null,"calibrated_by"?: string | null,"created_at"?: string,"face"?: Database["public"]['Enums']["blade_face"] | null,"format"?: Database["public"]['Enums']["mosaic_format"],"height_px"?: number,"id"?: string,"inspection_id"?: string,"kind"?: Database["public"]['Enums']["mosaic_kind"],"mm_per_px"?: number | null,"path"?: string,"project_id"?: string,"root_at_top"?: boolean | null,"root_row_px"?: number | null,"spectrum"?: Database["public"]['Enums']["spectrum"],"tip_row_px"?: number | null,"updated_at"?: string,"width_px"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "mosaics_calibrated_by_fkey"
      columns: ["calibrated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mosaics_inspection_id_fkey"
      columns: ["inspection_id"]
isOneToOne: false
      referencedRelation: "inspections"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mosaics_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_members": {
                  Row: {
                    "created_at": string,"organization_id": string,"role": Database["public"]['Enums']["org_member_role"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"organization_id": string,"role": Database["public"]['Enums']["org_member_role"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"organization_id"?: string,"role"?: Database["public"]['Enums']["org_member_role"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_members_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"slug": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string | null,"full_name": string | null,"id": string,"is_active": boolean,"platform_role": Database["public"]['Enums']["platform_role"] | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string | null,"id": string,"is_active"?: boolean,"platform_role"?: Database["public"]['Enums']["platform_role"] | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string | null,"id"?: string,"is_active"?: boolean,"platform_role"?: Database["public"]['Enums']["platform_role"] | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"project_assignments": {
                  Row: {
                    "assigned_at": string,"assigned_by": string | null,"project_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_at"?: string,"assigned_by"?: string | null,"project_id": string,"user_id": string
                  }
                  Update: {
                    "assigned_at"?: string,"assigned_by"?: string | null,"project_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_assignments_assigned_by_fkey"
      columns: ["assigned_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_assignments_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_assignments_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"project_sites": {
                  Row: {
                    "project_id": string,"site_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "project_id": string,"site_id": string
                  }
                  Update: {
                    "project_id"?: string,"site_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_sites_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_sites_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"projects": {
                  Row: {
                    "code": string | null,"contacts": NonNullable<Json>,"created_at": string,"created_by": string | null,"default_assistant_name": string | null,"default_drone_model": string | null,"default_pilot_name": string | null,"end_date": string | null,"id": string,"name": string,"notes": string | null,"organization_id": string,"start_date": string | null,"status": Database["public"]['Enums']["project_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code"?: string | null,"contacts"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"default_assistant_name"?: string | null,"default_drone_model"?: string | null,"default_pilot_name"?: string | null,"end_date"?: string | null,"id"?: string,"name": string,"notes"?: string | null,"organization_id": string,"start_date"?: string | null,"status"?: Database["public"]['Enums']["project_status"],"updated_at"?: string
                  }
                  Update: {
                    "code"?: string | null,"contacts"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"default_assistant_name"?: string | null,"default_drone_model"?: string | null,"default_pilot_name"?: string | null,"end_date"?: string | null,"id"?: string,"name"?: string,"notes"?: string | null,"organization_id"?: string,"start_date"?: string | null,"status"?: Database["public"]['Enums']["project_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "projects_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"sites": {
                  Row: {
                    "created_at": string,"id": string,"kind": Database["public"]['Enums']["site_kind"],"lat": number | null,"lon": number | null,"name": string,"notes": string | null,"organization_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["site_kind"],"lat"?: number | null,"lon"?: number | null,"name": string,"notes"?: string | null,"organization_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["site_kind"],"lat"?: number | null,"lon"?: number | null,"name"?: string,"notes"?: string | null,"organization_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sites_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"thermal_captures": {
                  Row: {
                    "ambient_temp_c": number | null,"capture_id": string,"distance_m": number | null,"emissivity": number | null,"humidity_pct": number | null,"matrix_path": string | null,"project_id": string,"reflected_temp_c": number | null,"t_max_c": number | null,"t_min_c": number | null,"temp_offset": number,"temp_scale": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ambient_temp_c"?: number | null,"capture_id": string,"distance_m"?: number | null,"emissivity"?: number | null,"humidity_pct"?: number | null,"matrix_path"?: string | null,"project_id": string,"reflected_temp_c"?: number | null,"t_max_c"?: number | null,"t_min_c"?: number | null,"temp_offset"?: number,"temp_scale"?: number
                  }
                  Update: {
                    "ambient_temp_c"?: number | null,"capture_id"?: string,"distance_m"?: number | null,"emissivity"?: number | null,"humidity_pct"?: number | null,"matrix_path"?: string | null,"project_id"?: string,"reflected_temp_c"?: number | null,"t_max_c"?: number | null,"t_min_c"?: number | null,"temp_offset"?: number,"temp_scale"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "thermal_captures_capture_id_fkey"
      columns: ["capture_id"]
isOneToOne: true
      referencedRelation: "captures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "thermal_captures_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"wind_turbine_specs": {
                  Row: {
                    "asset_id": string,"blade_length_m": number | null,"hub_height_m": number | null,"manufacturer": string | null,"model": string | null,"rotor_diameter_m": number | null,"wtgm": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "asset_id": string,"blade_length_m"?: number | null,"hub_height_m"?: number | null,"manufacturer"?: string | null,"model"?: string | null,"rotor_diameter_m"?: number | null,"wtgm"?: Json | null
                  }
                  Update: {
                    "asset_id"?: string,"blade_length_m"?: number | null,"hub_height_m"?: number | null,"manufacturer"?: string | null,"model"?: string | null,"rotor_diameter_m"?: number | null,"wtgm"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "wind_turbine_specs_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: true
      referencedRelation: "assets"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "begin_inspection_delete":
{ Args: { "p_inspection_id": string,"p_reason"?: string }; Returns: string
                           },
"begin_scope_delete":
{ Args: { "p_id": string,"p_kind": string,"p_project_id"?: string,"p_reason"?: string }; Returns: (string)[]
                           },
"delete_project_row":
{ Args: { "p_project_id": string,"p_reason"?: string }; Returns: Json
                           },
"deletion_objects":
{ Args: { "p_inspection_id": string,"p_limit"?: number }; Returns: string[]
                           },
"deletion_preview":
{ Args: { "p_id": string,"p_kind": string,"p_project_id"?: string }; Returns: Json
                           },
"finish_inspection_delete":
{ Args: { "p_inspection_id": string }; Returns: Json
                           },
"ingest_manifest":
{ Args: { "p_manifest": Json }; Returns: Json
                           },
"mark_finding_reviewed":
{ Args: { "p_finding_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "asset_kind": "wind_turbine"|"solar_block"|"transmission_tower"|"transmission_span","blade_face": "TE"|"PS"|"LE"|"SS","blade_position": "A"|"B"|"C","confidence_level": "high"|"medium"|"low","finding_source": "ai"|"manual","finding_status": "detected"|"confirmed"|"dismissed","gsd_source": "lrf"|"altitude"|"focus"|"manual"|"mosaic_calibration","inspection_kind": "wind_blade"|"solar"|"transmission","inspection_status": "pending"|"captured"|"processing"|"in_review"|"approved","mosaic_format": "image"|"dzi","mosaic_kind": "blade_strip","org_member_role": "client_manager"|"client_viewer","platform_role": "admin"|"technician"|"service","project_status": "planned"|"in_field"|"processing"|"in_review"|"delivered"|"archived","sequence_direction": "root_to_tip"|"tip_to_root"|"unknown","site_kind": "wind_farm"|"solar_plant"|"transmission_line","spectrum": "rgb"|"thermal"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "asset_kind": ["wind_turbine", "solar_block", "transmission_tower", "transmission_span"],"blade_face": ["TE", "PS", "LE", "SS"],"blade_position": ["A", "B", "C"],"confidence_level": ["high", "medium", "low"],"finding_source": ["ai", "manual"],"finding_status": ["detected", "confirmed", "dismissed"],"gsd_source": ["lrf", "altitude", "focus", "manual", "mosaic_calibration"],"inspection_kind": ["wind_blade", "solar", "transmission"],"inspection_status": ["pending", "captured", "processing", "in_review", "approved"],"mosaic_format": ["image", "dzi"],"mosaic_kind": ["blade_strip"],"org_member_role": ["client_manager", "client_viewer"],"platform_role": ["admin", "technician", "service"],"project_status": ["planned", "in_field", "processing", "in_review", "delivered", "archived"],"sequence_direction": ["root_to_tip", "tip_to_root", "unknown"],"site_kind": ["wind_farm", "solar_plant", "transmission_line"],"spectrum": ["rgb", "thermal"]
          }
        }
} as const

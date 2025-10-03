#!/usr/bin/env python3
"""
Debug script to test comprehensive creation detection step by step
"""

import re
from typing import Optional, Dict, Any

def detect_comprehensive_creation(query: str) -> Optional[Dict[str, Any]]:
    """
    Debug version of the detection method
    """
    query_lower = query.lower().strip()
    
    print(f"🔍 DEBUG: Query (lowercase): '{query_lower}'")
    
    # Check for comprehensive supplement creation patterns
    supplement_patterns = [
        "create supplement with",
        "make supplement with", 
        "add supplement with",
        "new supplement with"
    ]
    
    # Check for comprehensive medicine creation patterns
    medicine_patterns = [
        "create medicine with",
        "make medicine with", 
        "add medicine with",
        "new medicine with"
    ]
    
    print(f"🔍 DEBUG: Supplement patterns: {supplement_patterns}")
    print(f"🔍 DEBUG: Medicine patterns: {medicine_patterns}")
    
    # Check for EXACT pattern matches first
    is_supplement_creation = any(query_lower.startswith(pattern) for pattern in supplement_patterns)
    is_medicine_creation = any(query_lower.startswith(pattern) for pattern in medicine_patterns)
    
    print(f"🔍 DEBUG: Is supplement creation: {is_supplement_creation}")
    print(f"🔍 DEBUG: Is medicine creation: {is_medicine_creation}")
    
    if is_supplement_creation or is_medicine_creation:
        print(f"✅ DEBUG: Pattern matched! Type: {'supplement' if is_supplement_creation else 'medicine'}")
        
        try:
            # Try to extract creation data from the query
            creation_data = extract_creation_data_from_query(query, "supplement" if is_supplement_creation else "medicine")
            print(f"🔍 DEBUG: Extracted data: {creation_data}")
            
            if creation_data:
                return {
                    "type": "supplement" if is_supplement_creation else "medicine",
                    "data": creation_data
                }
            else:
                print("❌ DEBUG: No creation data extracted")
        except Exception as e:
            print(f"❌ DEBUG: Exception during extraction: {str(e)}")
            import traceback
            traceback.print_exc()
    else:
        print("❌ DEBUG: No pattern matched")
    
    return None

def extract_creation_data_from_query(query: str, creation_type: str) -> Optional[Dict[str, Any]]:
    """
    Debug version of the extraction method
    """
    print(f"🔍 DEBUG: Extracting {creation_type} data from query: '{query}'")
    
    try:
        if creation_type == "supplement":
            # Extract basic supplement information using regex patterns
            import re
            
            print("🔍 DEBUG: Using supplement extraction patterns")
            
            # Extract product name (look for quotes or "product name:" patterns)
            product_name_match = re.search(r'product\s*name\s*[:\s]+\s*["\']([^"\']+)["\']', query, re.IGNORECASE)
            if not product_name_match:
                # Try alternative pattern without quotes
                product_name_match = re.search(r'product\s*name\s*[:\s]+\s*([^,\n]+)', query, re.IGNORECASE)
            
            product_name = product_name_match.group(1).strip() if product_name_match else None
            print(f"🔍 DEBUG: Product name extracted: '{product_name}'")
            
            # Extract brand name
            brand_name_match = re.search(r'brand\s*[:\s]+\s*["\']([^"\']+)["\']', query, re.IGNORECASE)
            if not brand_name_match:
                brand_name_match = re.search(r'brand\s*[:\s]+\s*([^,\n]+)', query, re.IGNORECASE)
            
            brand_name = brand_name_match.group(1).strip() if brand_name_match else None
            print(f"🔍 DEBUG: Brand name extracted: '{brand_name}'")
            
            # Extract servings (look for various patterns)
            servings_match = re.search(r'servings?\s*[:\s]+\s*(\d+)', query, re.IGNORECASE)
            if not servings_match:
                # Try alternative pattern for "servingsPerContainer"
                servings_match = re.search(r'servingspercontainer\s*[:\s]+\s*(\d+)', query, re.IGNORECASE)
            servings = int(servings_match.group(1)) if servings_match else None
            print(f"🔍 DEBUG: Servings extracted: {servings}")
            print(f"🔍 DEBUG: Servings regex matched: {bool(servings_match)}")
            
            # Extract serving size
            serving_size_match = re.search(r'serving\s*size\s*[:\s]+\s*["\']([^"\']+)["\']', query, re.IGNORECASE)
            if not serving_size_match:
                serving_size_match = re.search(r'serving\s*size\s*[:\s]+\s*([^,\n]+)', query, re.IGNORECASE)
            
            serving_size = serving_size_match.group(1).strip() if serving_size_match else None
            print(f"🔍 DEBUG: Serving size extracted: '{serving_size}'")
            
            # Extract ingredients (look for ingredient lists)
            # First try to find ingredients in square brackets (MongoDB ObjectId format)
            ingredients_match = re.search(r'ingredients?\s*[:\s]+\s*\[([^\]]+)\]', query, re.IGNORECASE)
            if ingredients_match:
                # Extract ObjectIds from square brackets
                ingredients_text = ingredients_match.group(1).strip()
                ingredients = [ing.strip() for ing in ingredients_text.split(',') if ing.strip()]
            else:
                # Fallback to quoted string if not in brackets
                ingredients_match = re.search(r'ingredients?\s*[:\s]+\s*["\']([^"\']+)["\']', query, re.IGNORECASE)
                ingredients = [ing.strip() for ing in ingredients_match.group(1).split(',')] if ingredients_match else []
            
            print(f"🔍 DEBUG: Ingredients extracted: {ingredients}")
            
            # Extract description
            desc_match = re.search(r'description\s*[:\s]+\s*["\']([^"\']+)["\']', query, re.IGNORECASE)
            if not desc_match:
                desc_match = re.search(r'description\s*[:\s]+\s*([^,\n]+)', query, re.IGNORECASE)
            
            description = desc_match.group(1).strip() if desc_match else "Health supplement"
            print(f"🔍 DEBUG: Description extracted: '{description}'")
            
            # Extract warnings (can be a list in brackets or a quoted string)
            warnings_match = re.search(r'warnings?\s*[:\s]+\s*(?:\[([^\]]+)\]|["\']([^"\']+)["\'])', query, re.IGNORECASE)
            if warnings_match:
                warnings_text = warnings_match.group(1) or warnings_match.group(2)
                warnings = [w.strip() for w in warnings_text.split(',') if w.strip()]
            else:
                warnings = ["Consult healthcare provider"]
            
            print(f"🔍 DEBUG: Warnings extracted: {warnings}")
            
            # Extract claims (can be a list in brackets or a quoted string)
            claims_match = re.search(r'claims?\s*[:\s]+\s*(?:\[([^\]]+)\]|["\']([^"\']+)["\'])', query, re.IGNORECASE)
            if claims_match:
                claims_text = claims_match.group(1) or claims_match.group(2)
                claims = [c.strip() for c in claims_text.split(',') if c.strip()]
            else:
                claims = ["General health support"]
            
            print(f"🔍 DEBUG: Claims extracted: {claims}")
            
            # Extract tags (can be a list in brackets or a quoted string)
            tags_match = re.search(r'tags?\s*[:\s]+\s*(?:\[([^\]]+)\]|["\']([^"\']+)["\'])', query, re.IGNORECASE)
            if tags_match:
                tags_text = tags_match.group(1) or tags_match.group(2)
                tags = [t.strip() for t in tags_text.split(',') if t.strip()]
            else:
                tags = ["Health", "Supplement"]
            
            print(f"🔍 DEBUG: Tags extracted: {tags}")
            
            # Extract usageGroup (can be a list in brackets or a quoted string)
            usage_group_match = re.search(r'usageGroup?\s*[:\s]+\s*(?:\[([^\]]+)\]|["\']([^"\']+)["\'])', query, re.IGNORECASE)
            if usage_group_match:
                usage_group_text = usage_group_match.group(1) or usage_group_match.group(2)
                usage_group = [ug.strip() for ug in usage_group_text.split(',') if ug.strip()]
            else:
                usage_group = ["Adults"]
            
            print(f"🔍 DEBUG: Usage group extracted: {usage_group}")
            
            # Extract isAvailable (boolean)
            is_available_match = re.search(r'isAvailable\s*[:\s]+\s*(true|false)', query, re.IGNORECASE)
            is_available = is_available_match.group(1).lower() == 'true' if is_available_match else True
            
            print(f"🔍 DEBUG: Is available extracted: {is_available}")
            
            result = {
                "productName": product_name,
                "brandName": brand_name,
                "servingsPerContainer": servings,
                "servingSize": serving_size,
                "ingredients": ingredients,
                "usageGroup": usage_group,
                "description": description,
                "warnings": warnings,
                "claims": claims,
                "isAvailable": is_available,
                "tags": tags
            }
            
            print(f"✅ DEBUG: Final extracted data: {result}")
            return result
            
        else:
            print(f"🔍 DEBUG: Medicine extraction not implemented in debug version")
            return None
            
    except Exception as e:
        print(f"❌ DEBUG: Exception in extraction: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

def main():
    """Test the detection with the user's actual query"""
    
    # User's actual query
    test_query = 'create supplement with product name: My Supplement 3, servingsPerContainer: 30, servingSize: 10g,description: Boosts energy, warnings: [Not for kids, Consult doctor], claims: [Boosts immunity, Increases stamina], isAvailable: true'
    
    print("🧪 TESTING COMPREHENSIVE CREATION DETECTION")
    print("=" * 60)
    print(f"Query: {test_query}")
    print("=" * 60)
    
    result = detect_comprehensive_creation(test_query)
    
    print("\n" + "=" * 60)
    if result:
        print(f"✅ SUCCESS: Detection returned: {result}")
    else:
        print("❌ FAILED: Detection returned None")
    print("=" * 60)

if __name__ == "__main__":
    main()

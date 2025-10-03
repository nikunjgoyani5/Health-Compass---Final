export const apiOk = (res, data=null, message="OK") => res.status(200).json({ success:true, message, data });
export const apiCreated = (res, data=null, message="Created") => res.status(201).json({ success:true, message, data });
export const apiBad = (res, message="Bad Request", code=400, data=null) => res.status(code).json({ success:false, message, data });

// AWS specific error handling
export const handleAwsError = (error, fallbackData, source = 'AWS') => {
  console.error(`${source} Error:`, error);
  
  // Check for specific AWS error types
  if (error.name === 'AccessDenied' || error.Code === 'AccessDenied') {
    console.log(`AWS ${source} permissions not available, using fallback data`);
    return { ...fallbackData, source: 'fallback_permissions', error: 'AccessDenied' };
  }
  
  if (error.name === 'UnauthorizedOperation' || error.Code === 'UnauthorizedOperation') {
    console.log(`AWS ${source} permissions not available, using fallback data`);
    return { ...fallbackData, source: 'fallback_permissions', error: 'UnauthorizedOperation' };
  }
  
  if (error.name === 'InvalidUserID.NotFound' || error.Code === 'InvalidUserID.NotFound') {
    console.log(`AWS ${source} user not found, using fallback data`);
    return { ...fallbackData, source: 'fallback_user', error: 'InvalidUserID.NotFound' };
  }
  
  // Generic error fallback
  return { ...fallbackData, source: 'fallback', error: error.message };
};

// AWS service status checker
export const checkAwsServiceStatus = (error) => {
  if (!error) return 'HEALTHY';
  
  if (error.name === 'AccessDenied' || error.Code === 'AccessDenied') {
    return 'PERMISSION_DENIED';
  }
  
  if (error.name === 'UnauthorizedOperation' || error.Code === 'UnauthorizedOperation') {
    return 'UNAUTHORIZED';
  }
  
  if (error.name === 'InvalidUserID.NotFound' || error.Code === 'InvalidUserID.NotFound') {
    return 'USER_NOT_FOUND';
  }
  
  return 'ERROR';
};
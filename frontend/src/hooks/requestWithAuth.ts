interface RequestConfig {
    headers?: Record<string, string>;
    [key: string]: any;
}

interface ResponseData {
    data: any;
    error: null | string;
    contentType?: string;
}

// Function to refresh access token
const refreshAccessToken = async (): Promise<string | null> => {
    try {
        const baseUrl = import.meta.env.VITE_API_URL;
        const response = await fetch(`${baseUrl}/api/auth/refresh-token`, {
            method: 'POST',
            credentials: 'include', // Important to include cookies
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to refresh token');
        }

        const data = await response.json();
        if (data.success && data.accessToken) {
            localStorage.setItem('accessToken', data.accessToken);
            return data.accessToken;
        }
        
        return null;
    } catch (error) {
        console.error('Token refresh error:', error);
        return null;
    }
};

export const requestWithAuth = (
    url: string,
    method: string,
    data: Object | FormData | null,
    config?: RequestConfig
): Promise<ResponseData> => {
    return new Promise<ResponseData>(async (resolve) => {
        let token = localStorage.getItem('accessToken');
        const baseUrl = import.meta.env.VITE_API_URL;

        if (!token) {
            const newToken = await refreshAccessToken();
            if (!newToken) {
                resolve({
                    data: null,
                    error: 'Please Login in first'
                });
                return;
            }
            token = newToken;
        }

        const makeRequest = async (authToken: string): Promise<ResponseData> => {
            const headers: Record<string, string> = {
                'Authorization': `Bearer ${authToken}`,
                ...config?.headers
            };

            // Only set Content-Type for non-FormData requests
            if (!(data instanceof FormData)) {
                headers['Content-Type'] = 'application/json';
            }
    
            try {
                const res = await fetch(`${baseUrl}/${url}`, {
                    method,
                    body: data instanceof FormData ? data : (data ? JSON.stringify(data) : undefined),
                    credentials: 'include', // Always include cookies for refresh token
                    headers
                });

                // Handle token expiration
                if (res.status === 401) {
                    // Try to refresh the token
                    const newToken = await refreshAccessToken();
                    
                    if (newToken) {
                        // Retry the request with new token
                        return makeRequest(newToken);
                    } else {
                        // If refresh fails, clear token and return error
                        localStorage.removeItem('accessToken');
                        return {
                            data: null,
                            error: 'Session expired. Please login again.'
                        };
                    }
                }
                
                if (!res.ok) {
                    // Try to parse error as JSON, but fallback if it's not
                    let errorPayload: any = { message: 'Request failed with status ' + res.status };
                    try {
                        const errorData = await res.json();
                        if (errorData.error?.message) {
                            errorPayload.message = errorData.error.message;
                        } else if (errorData.message) {
                            errorPayload.message = errorData.message;
                        }
                    } catch (e) {
                        // If error response is not JSON, use the status text or a generic message
                        errorPayload.message = res.statusText || `Request failed with status ${res.status}`;
                    }
                    throw new Error(errorPayload.message);
                }
                
                const contentType = res.headers.get("content-type");

                if (contentType && contentType.includes("application/json")) {
                    const responseDataJson = await res.json();
                    return {
                        data: responseDataJson,
                        error: null,
                        contentType: "application/json"
                    };
                } else if (contentType && (contentType.startsWith("audio/") || contentType.startsWith("video/") || contentType.startsWith("image/") || contentType === "application/octet-stream")) {
                    const responseDataBlob = await res.blob();
                    return {
                        data: responseDataBlob,
                        error: null,
                        contentType
                    };
                } else if (contentType && contentType.startsWith("text/")) {
                    const responseDataText = await res.text();
                    return {
                        data: responseDataText,
                        error: null,
                        contentType
                    };
                } else {
                    // Fallback for unknown content types, try blob
                    const responseDataBlob = await res.blob();
                     return {
                        data: responseDataBlob,
                        error: null,
                        contentType: contentType || 'application/octet-stream' // best guess
                    };
                }

            } catch (err) {
                // Handle different types of network errors
                let errorMessage = 'Network Error!';
                
                if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
                    errorMessage = 'Network Error! Check your internet connection.';
                } else if (err instanceof Error) {
                    errorMessage = err.message;
                }
                
                return {
                    data: null,
                    error: errorMessage
                };
            }
        };

        const result = await makeRequest(token);
        resolve(result);
    });
};
interface RequestConfig {
    headers?: Record<string, string>;
    [key: string]: any;
}

interface ResponseData {
    data: any;
    error: null | string;
}

export const requestNoAuth = (
    url: string,
    method: string,
    data: Object | null,
    config?: RequestConfig
): Promise<ResponseData> => {
    return new Promise<ResponseData>((resolve) => {
        const baseUrl = import.meta.env.VITE_API_URL;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...config?.headers
        };

        fetch(`${baseUrl}/${url}`, {
            method,
            body: data ? JSON.stringify(data) : undefined,
            credentials: 'include',
            headers
        })
        .then(async (res) => {
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error?.message || 'Request failed');
            }
            const responseData = await res.json();
            resolve({
                data: responseData,
                error: null
            });
        })
        .catch((err: Error) => {
            // Handle different types of network errors
            let errorMessage = 'Network Error!';
            
            if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
                errorMessage = 'Network Error! Check your internet connection.';
            } else if (err.message) {
                errorMessage = err.message;
            }
            
            resolve({
                data: null,
                error: errorMessage
            });
        });
    });
};
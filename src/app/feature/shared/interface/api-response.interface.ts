export interface ApiResponse<T> {
    total_results: number;
    query: string;
    data: T[];
}

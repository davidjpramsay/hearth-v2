import {
  ApiErrorSchema,
  PHOTO_UPLOAD_TIMEOUT_MS,
  PhotoUploadResultSchema,
  type PhotoUploadResult,
} from '@hearth/shared';
import { HearthApiError } from './core';

export interface PhotoUploadProgress {
  fraction: number;
  processing: boolean;
}

/** Raw same-origin File body: no filename, credential, or data URL is serialized. */
export function sendPhotoUpload(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress?: (progress: PhotoUploadProgress) => void,
): Promise<PhotoUploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.timeout = PHOTO_UPLOAD_TIMEOUT_MS;
    xhr.responseType = 'json';
    xhr.setRequestHeader('Accept', 'application/json');
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0)
        onProgress?.({ fraction: Math.min(1, event.loaded / event.total), processing: false });
    };
    xhr.upload.onload = () => onProgress?.({ fraction: 1, processing: true });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const result = PhotoUploadResultSchema.safeParse(xhr.response);
        if (result.success) resolve(result.data);
        else reject(new Error('Hearth could not confirm that photo. Retry it to check safely.'));
      } else {
        const error = ApiErrorSchema.safeParse(xhr.response);
        reject(
          error.success
            ? new HearthApiError(error.data)
            : new Error(
                xhr.status === 413
                  ? 'That photo is larger than the server allows.'
                  : 'Hearth could not add that photo. Retry when connected.',
              ),
        );
      }
    };
    xhr.onerror = () =>
      reject(new Error('Connection interrupted. Retry this photo when connected.'));
    xhr.ontimeout = () =>
      reject(new Error('This photo took too long. Retry to check whether Hearth received it.'));
    xhr.onabort = () =>
      reject(new Error('Photo upload interrupted. Retry to check whether Hearth received it.'));
    xhr.send(file);
  });
}

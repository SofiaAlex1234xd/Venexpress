import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { extname } from 'path';

/**
 * Servicio para gestionar el almacenamiento de archivos en Supabase Storage
 * 
 * Estructura de carpetas en el bucket:
 * proofs/
 *   └── transactions/
 *       └── {transactionId}/
 *           └── {type}-{timestamp}.{ext}
 */
@Injectable()
export class StorageService {
    private readonly logger = new Logger(StorageService.name);
    private readonly supabase: SupabaseClient;
    private readonly bucketName = 'DataVenexpressStorage';
    private readonly signedUrlExpiration: number;

    constructor(private readonly configService: ConfigService) {
        const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
        const supabaseServiceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !supabaseServiceRoleKey) {
            this.logger.error('Missing Supabase configuration');
            throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
        }

        this.supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });

        // Expiración de signed URLs en segundos (por defecto 1 hora)
        this.signedUrlExpiration = this.configService.get<number>('SIGNED_URL_EXPIRATION') || 3600;

        this.logger.log('Supabase Storage service initialized');
    }

    /**
     * Sube un archivo al bucket de Supabase Storage
     * 
     * @param file - Archivo de Express.Multer.File con buffer
     * @param transactionId - ID de la transacción
     * @param type - Tipo de comprobante: 'cliente' | 'venezuela' | 'rejection'
     * @returns Ruta del archivo en el bucket
     */
    async uploadFile(
        file: Express.Multer.File,
        transactionId: number | string,
        type: 'cliente' | 'venezuela' | 'rejection' = 'venezuela',
    ): Promise<string> {
        if (!file || !file.buffer) {
            throw new BadRequestException('No se proporcionó ningún archivo o el archivo está vacío');
        }

        // Validar tipo de archivo
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
        if (!allowedMimeTypes.includes(file.mimetype)) {
            throw new BadRequestException('Solo se permiten imágenes (JPG, PNG) y PDFs');
        }

        // Validar tamaño (5MB máximo)
        const maxSize = 5 * 1024 * 1024;
        if (file.size > maxSize) {
            throw new BadRequestException('El archivo excede el tamaño máximo de 5MB');
        }

        // Generar nombre único para el archivo
        const timestamp = Date.now();
        const randomSuffix = Math.round(Math.random() * 1e9);
        const extension = extname(file.originalname).toLowerCase() || this.getExtensionFromMimeType(file.mimetype);
        const fileName = `${type}-${timestamp}-${randomSuffix}${extension}`;

        // Estructura de carpetas: 
        // - Para pagos de Venezuela: venezuela-payments/{paymentId}/{fileName}
        // - Para transacciones: transactions/{transactionId}/{fileName}
        let filePath: string;
        if (typeof transactionId === 'string' && transactionId.startsWith('venezuela-payment-')) {
            filePath = `venezuela-payments/${transactionId}/${fileName}`;
        } else {
            filePath = `transactions/${transactionId}/${fileName}`;
        }

        this.logger.log(`Uploading file to: ${filePath}`);

        try {
            const { data, error } = await this.supabase.storage
                .from(this.bucketName)
                .upload(filePath, file.buffer, {
                    contentType: file.mimetype,
                    upsert: false,
                });

            if (error) {
                this.logger.error(`Error uploading file: ${error.message}`, error);
                throw new InternalServerErrorException(`Error al subir el archivo: ${error.message}`);
            }

            this.logger.log(`File uploaded successfully: ${data.path}`);

            // Retornamos solo la ruta relativa, no la URL completa
            return data.path;
        } catch (error) {
            if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
                throw error;
            }
            this.logger.error('Unexpected error uploading file', error);
            throw new InternalServerErrorException('Error inesperado al subir el archivo');
        }
    }

    /**
     * Genera una signed URL para acceder a un archivo privado
     * 
     * @param filePath - Ruta del archivo en el bucket
     * @param expiresIn - Tiempo de expiración en segundos (opcional)
     * @returns URL firmada para acceder al archivo
     */
    async getSignedUrl(filePath: string, expiresIn?: number): Promise<string> {
        if (!filePath) {
            throw new BadRequestException('La ruta del archivo es requerida');
        }

        const expiration = expiresIn || this.signedUrlExpiration;

        try {
            const { data, error } = await this.supabase.storage
                .from(this.bucketName)
                .createSignedUrl(filePath, expiration);

            if (error) {
                this.logger.error(`Error creating signed URL: ${error.message}`, error);
                throw new InternalServerErrorException(`Error al generar URL de acceso: ${error.message}`);
            }

            return data.signedUrl;
        } catch (error) {
            if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
                throw error;
            }
            this.logger.error('Unexpected error creating signed URL', error);
            throw new InternalServerErrorException('Error inesperado al generar URL de acceso');
        }
    }

    /**
     * Genera múltiples signed URLs para varios archivos
     * 
     * @param filePaths - Array de rutas de archivos
     * @param expiresIn - Tiempo de expiración en segundos (opcional)
     * @returns Objeto con rutas como keys y URLs firmadas como values
     */
    async getSignedUrls(filePaths: string[], expiresIn?: number): Promise<Record<string, string>> {
        const result: Record<string, string> = {};

        for (const path of filePaths) {
            if (path) {
                try {
                    result[path] = await this.getSignedUrl(path, expiresIn);
                } catch (error) {
                    this.logger.warn(`Could not generate signed URL for: ${path}`);
                    result[path] = '';
                }
            }
        }

        return result;
    }

    /**
     * Elimina un archivo del bucket
     * 
     * @param filePath - Ruta del archivo a eliminar
     */
    async deleteFile(filePath: string): Promise<void> {
        if (!filePath) {
            return;
        }

        try {
            const { error } = await this.supabase.storage
                .from(this.bucketName)
                .remove([filePath]);

            if (error) {
                this.logger.error(`Error deleting file: ${error.message}`, error);
                // No lanzamos error para no interrumpir el flujo
            } else {
                this.logger.log(`File deleted successfully: ${filePath}`);
            }
        } catch (error) {
            this.logger.error('Unexpected error deleting file', error);
        }
    }

    /**
     * Elimina todos los archivos de una transacción
     * 
     * @param transactionId - ID de la transacción
     */
    async deleteTransactionFiles(transactionId: number | string): Promise<void> {
        const folderPath = `transactions/${transactionId}`;

        try {
            // Listar todos los archivos en la carpeta
            const { data: files, error: listError } = await this.supabase.storage
                .from(this.bucketName)
                .list(folderPath);

            if (listError) {
                this.logger.error(`Error listing files: ${listError.message}`);
                return;
            }

            if (files && files.length > 0) {
                const filePaths = files.map(file => `${folderPath}/${file.name}`);

                const { error: deleteError } = await this.supabase.storage
                    .from(this.bucketName)
                    .remove(filePaths);

                if (deleteError) {
                    this.logger.error(`Error deleting transaction files: ${deleteError.message}`);
                } else {
                    this.logger.log(`Deleted ${filePaths.length} files for transaction ${transactionId}`);
                }
            }
        } catch (error) {
            this.logger.error('Unexpected error deleting transaction files', error);
        }
    }

    /**
     * Verifica si un archivo existe en el bucket
     * 
     * @param filePath - Ruta del archivo
     * @returns true si el archivo existe
     */
    async fileExists(filePath: string): Promise<boolean> {
        if (!filePath) {
            return false;
        }

        try {
            // Intentamos obtener metadata del archivo
            const { data, error } = await this.supabase.storage
                .from(this.bucketName)
                .list(filePath.substring(0, filePath.lastIndexOf('/')), {
                    search: filePath.substring(filePath.lastIndexOf('/') + 1),
                });

            return !error && data && data.length > 0;
        } catch {
            return false;
        }
    }

    /**
     * Obtiene la extensión de archivo basada en el MIME type
     */
    private getExtensionFromMimeType(mimeType: string): string {
        const mimeToExt: Record<string, string> = {
            'image/jpeg': '.jpg',
            'image/jpg': '.jpg',
            'image/png': '.png',
            'application/pdf': '.pdf',
        };
        return mimeToExt[mimeType] || '.bin';
    }
}

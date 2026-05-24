import { Injectable, OnModuleInit, Logger, BadRequestException } from '@nestjs/common';
import * as faceapi from '@vladmandic/face-api';
import { Canvas, Image, ImageData, loadImage } from 'canvas';
import * as path from 'path';

// Patch Node.js environment for face-api
const env = faceapi.env;
env.monkeyPatch({ Canvas, Image, ImageData } as any);

@Injectable()
export class FaceRecognitionService implements OnModuleInit {
  private readonly logger = new Logger(FaceRecognitionService.name);
  private isModelsLoaded = false;

  async onModuleInit() {
    await this.loadModels();
  }

  private async loadModels() {
    try {
      // Models directory
      const modelsDir = path.join(process.cwd(), 'models');
      
      this.logger.log(`Loading face-api models from ${modelsDir}...`);
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromDisk(modelsDir),
        faceapi.nets.faceLandmark68Net.loadFromDisk(modelsDir),
        faceapi.nets.faceRecognitionNet.loadFromDisk(modelsDir)
      ]);
      this.isModelsLoaded = true;
      this.logger.log('Face-api models loaded successfully.');
    } catch (error) {
      this.logger.error('Failed to load face-api models', error);
    }
  }

  async getDescriptorFromBase64(base64Str: string): Promise<Float32Array> {
    if (!this.isModelsLoaded) {
      throw new BadRequestException('Face recognition models are not loaded yet. Please try again later.');
    }

    try {
      // Remove data URL prefix if exists
      const base64Data = base64Str.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      // Load image into canvas object that faceapi understands
      const img = await loadImage(buffer);

      // Detect face using TinyFaceDetector for performance
      const detection = await faceapi.detectSingleFace(img as any, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        throw new BadRequestException('Wajah tidak terdeteksi dalam foto. Pastikan pencahayaan cukup dan wajah terlihat jelas.');
      }

      return detection.descriptor;
    } catch (error: any) {
      this.logger.error('Error processing face image:', error.message);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Gagal memproses gambar wajah');
    }
  }

  compareDescriptors(storedDescriptorArr: number[], currentDescriptor: Float32Array): number {
    const storedDescriptor = new Float32Array(storedDescriptorArr);
    // Euclidean distance (lower is better, < 0.5 is a strict match, < 0.6 is typical)
    return faceapi.euclideanDistance(storedDescriptor, currentDescriptor);
  }
}

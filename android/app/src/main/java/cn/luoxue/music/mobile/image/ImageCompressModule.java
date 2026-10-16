package cn.luoxue.music.mobile.image;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

import java.io.File;
import java.io.FileOutputStream;

/**
 * 封面临时图压缩：长边优先缩到 maxSize，输出 JPEG。
 * 原图长边不超过 maxSize 且体积不超过 maxDirectBytes 时直接使用原图。
 */
public class ImageCompressModule extends ReactContextBaseJavaModule {

  ImageCompressModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "ImageCompressModule";
  }

  @ReactMethod
  public void compressImage(String srcPath, String destPath, double maxSizeValue, double qualityValue,
      double maxDirectBytesValue, Promise promise) {
    try {
      int maxSize = (int) maxSizeValue;
      int quality = (int) qualityValue;
      long maxDirectBytes = (long) maxDirectBytesValue;

      BitmapFactory.Options bounds = new BitmapFactory.Options();
      bounds.inJustDecodeBounds = true;
      BitmapFactory.decodeFile(srcPath, bounds);
      int width = bounds.outWidth;
      int height = bounds.outHeight;
      if (width <= 0 || height <= 0) {
        promise.reject("E_DECODE_FAILED", "Cannot decode image: " + srcPath);
        return;
      }

      File srcFile = new File(srcPath);
      long srcSize = srcFile.length();
      if (Math.max(width, height) <= maxSize && srcSize <= maxDirectBytes) {
        promise.resolve(buildResult(srcPath, width, height, srcSize));
        return;
      }

      int sampleSize = 1;
      int longSide = Math.max(width, height);
      while (longSide / (sampleSize * 2) >= maxSize) {
        sampleSize *= 2;
      }

      BitmapFactory.Options options = new BitmapFactory.Options();
      options.inSampleSize = sampleSize;
      Bitmap decoded = BitmapFactory.decodeFile(srcPath, options);
      if (decoded == null) {
        promise.reject("E_DECODE_FAILED", "Cannot decode image: " + srcPath);
        return;
      }

      Bitmap scaled = scaleToLongSide(decoded, maxSize);
      if (scaled != decoded) {
        decoded.recycle();
      }

      File destFile = new File(destPath);
      File parent = destFile.getParentFile();
      if (parent != null && !parent.exists()) {
        parent.mkdirs();
      }
      FileOutputStream output = new FileOutputStream(destFile, false);
      scaled.compress(Bitmap.CompressFormat.JPEG, quality, output);
      output.flush();
      output.close();

      int outWidth = scaled.getWidth();
      int outHeight = scaled.getHeight();
      scaled.recycle();

      if (!destFile.exists() || destFile.length() <= 0) {
        promise.reject("E_COMPRESS_FAILED", "Compressed file is empty: " + destPath);
        return;
      }

      promise.resolve(buildResult(destPath, outWidth, outHeight, destFile.length()));
    } catch (Exception e) {
      promise.reject("E_COMPRESS_FAILED", e);
    }
  }

  private Bitmap scaleToLongSide(Bitmap src, int maxSize) {
    int width = src.getWidth();
    int height = src.getHeight();
    int longSide = Math.max(width, height);
    if (longSide <= maxSize) {
      return src;
    }
    float ratio = (float) maxSize / (float) longSide;
    int targetWidth = Math.max(1, Math.round(width * ratio));
    int targetHeight = Math.max(1, Math.round(height * ratio));
    return Bitmap.createScaledBitmap(src, targetWidth, targetHeight, true);
  }

  private WritableMap buildResult(String path, int width, int height, long size) {
    WritableMap map = Arguments.createMap();
    map.putString("path", path);
    map.putInt("width", width);
    map.putInt("height", height);
    map.putDouble("size", (double) size);
    return map;
  }
}

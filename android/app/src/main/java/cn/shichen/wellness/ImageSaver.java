package cn.shichen.wellness;

import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.BitmapFactory;
import android.graphics.Bitmap;
import android.net.Uri;
import android.media.MediaScannerConnection;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.UUID;

/** Saves only bounded valid PNG bytes and shares only URIs successfully created by this app. */
final class ImageSaver {
    private final Context context;
    private final SharedPreferences prefs;
    ImageSaver(Context context){this.context=context.getApplicationContext();prefs=this.context.getSharedPreferences("shichen-images-v1",Context.MODE_PRIVATE);}
    JSONObject save(JSONObject input) throws Exception {
        String encoded=input.getString("pngBase64");
        if(encoded.startsWith("data:image/png;base64,"))encoded=encoded.substring("data:image/png;base64,".length());
        if(encoded.length()>11*1024*1024 || !encoded.matches("[A-Za-z0-9+/=\\r\\n]+"))throw new IllegalArgumentException("图片数据无效或过大，请缩小后重试。");
        byte[] bytes;
        try{bytes=Base64.decode(encoded,Base64.DEFAULT);}catch(Exception e){throw new IllegalArgumentException("图片编码无效。");}
        if(bytes.length<24||bytes.length>8*1024*1024||bytes[0]!=(byte)137||bytes[1]!=80||bytes[2]!=78||bytes[3]!=71||bytes[4]!=13||bytes[5]!=10||bytes[6]!=26||bytes[7]!=10)
            throw new IllegalArgumentException("只支持有效的 PNG 图片。");
        BitmapFactory.Options dimensions=new BitmapFactory.Options();dimensions.inJustDecodeBounds=true;
        BitmapFactory.decodeByteArray(bytes,0,bytes.length,dimensions);
        if(dimensions.outWidth<=0||dimensions.outHeight<=0||dimensions.outWidth>4096||dimensions.outHeight>4096||(long)dimensions.outWidth*dimensions.outHeight>8000000)
            throw new IllegalArgumentException("图片尺寸无效或过大。");
        Bitmap decoded=BitmapFactory.decodeByteArray(bytes,0,bytes.length);
        if(decoded==null)throw new IllegalArgumentException("图片内容无法读取，请重新生成。");
        decoded.recycle();
        String name=input.optString("displayName","时辰心管家").replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]","_").replaceFirst("(?i)\\.png$","");
        if(name.length()>60)name=name.substring(0,60);
        if(name.trim().isEmpty())name="时辰心管家";
        name=name+"-"+System.currentTimeMillis()+"-"+UUID.randomUUID().toString().substring(0,8)+".png";
        ContentValues values=new ContentValues();values.put(MediaStore.Images.Media.DISPLAY_NAME,name);values.put(MediaStore.Images.Media.MIME_TYPE,"image/png");
        File legacyFile=null;
        if(Build.VERSION.SDK_INT>=29){values.put(MediaStore.Images.Media.RELATIVE_PATH,Environment.DIRECTORY_PICTURES+"/Shichen");values.put(MediaStore.Images.Media.IS_PENDING,1);}
        else{
            File directory=new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),"Shichen");
            if(!directory.isDirectory()&&!directory.mkdirs())throw new IllegalStateException("无法创建图片保存目录。");
            legacyFile=new File(directory,name);values.put(MediaStore.Images.Media.DATA,legacyFile.getAbsolutePath());
        }
        ContentResolver resolver=context.getContentResolver();Uri uri=null;
        try{
            uri=resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,values);
            if(uri==null)throw new IllegalStateException("图库没有创建保存位置。");
            try(OutputStream output=resolver.openOutputStream(uri,"w")){
                if(output==null)throw new IllegalStateException("无法写入图库。");output.write(bytes);output.flush();
            }
            // Read every byte back before exposing success; a container may accept an insert but fail the write.
            long verified=0;
            try(InputStream check=resolver.openInputStream(uri)){
                if(check==null)throw new IllegalStateException("无法确认已保存的图片。");
                byte[] buffer=new byte[8192];int count;
                while((count=check.read(buffer))!=-1){verified+=count;if(verified>bytes.length)break;}
            }
            if(verified!=bytes.length)throw new IllegalStateException("图片未完整写入，请重试。");
            ContentValues ready=new ContentValues();ready.put(MediaStore.Images.Media.WIDTH,dimensions.outWidth);ready.put(MediaStore.Images.Media.HEIGHT,dimensions.outHeight);
            ready.put(MediaStore.Images.Media.SIZE,verified);ready.put(MediaStore.Images.Media.DATE_MODIFIED,System.currentTimeMillis()/1000);
            if(Build.VERSION.SDK_INT>=29)ready.put(MediaStore.Images.Media.IS_PENDING,0);
            if(resolver.update(uri,ready,null,null)!=1)throw new IllegalStateException("图库未确认图片完成。");
            if(legacyFile!=null)MediaScannerConnection.scanFile(context,new String[]{legacyFile.getAbsolutePath()},new String[]{"image/png"},null);
            JSONArray list=new JSONArray(prefs.getString("created","[]")),next=new JSONArray();next.put(uri.toString());
            for(int i=0;i<Math.min(list.length(),99);i++)next.put(list.getString(i));
            if(!prefs.edit().putString("created",next.toString()).commit())throw new IllegalStateException("无法保存图片记录，请重试。");
            return new JSONObject().put("saved",true).put("uri",uri.toString()).put("displayName",name)
                .put("location","当前安卓环境的 Pictures/Shichen").put("bytes",verified);
        }catch(Exception error){
            if(uri!=null)try{resolver.delete(uri,null,null);}catch(Exception ignored){}
            if(legacyFile!=null&&legacyFile.exists())legacyFile.delete();
            throw error;
        }
    }
    Intent share(String value) throws Exception {
        Uri uri=Uri.parse(value);
        if(!"content".equals(uri.getScheme())||!"media".equals(uri.getAuthority()))throw new IllegalArgumentException("只能分享本应用已保存的图片。");
        JSONArray list=new JSONArray(prefs.getString("created","[]"));boolean known=false;
        for(int i=0;i<list.length();i++)if(value.equals(list.getString(i)))known=true;
        if(!known)throw new IllegalArgumentException("请先保存这张图片，再打开分享面板。");
        try(InputStream check=context.getContentResolver().openInputStream(uri)){if(check==null||check.read()<0)throw new IllegalStateException("图片已移除或不可读取，请重新保存。");}
        Intent send=new Intent(Intent.ACTION_SEND).setType("image/png").putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        send.setClipData(ClipData.newUri(context.getContentResolver(),"时辰心管家卡片",uri));
        return Intent.createChooser(send,"分享卡片图片").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    }
}

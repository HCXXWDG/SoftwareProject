package com.example.commutemood.application;

import com.example.commutemood.config.AppProperties;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

@Service
public class DeviceIdentityService {
    private final String salt;

    public DeviceIdentityService(AppProperties properties) {
        this.salt = properties.deviceHashSalt();
    }

    public String hash(String rawDeviceId) {
        if (rawDeviceId == null || rawDeviceId.isBlank() || rawDeviceId.length() > 200) {
            throw new IllegalArgumentException("X-Device-Id is required");
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(
                    digest.digest((salt + ":" + rawDeviceId).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}


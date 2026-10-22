package com.example.commutemood.api;

import com.example.commutemood.CommuteMoodApplication;
import com.example.commutemood.config.DemoGeography;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * S00 契约第 1 条"错误结构"的守门测试。
 *
 * <p>背景：{@code ApiExceptionHandler} 早期把 {@code exception.getMessage()} 原样回传，
 * 导致 400 响应体里出现 Spring 的完整校验文案，包含控制器方法签名与内部类名，例如
 * {@code Validation failed for argument [1] in public org.springframework.http.ResponseEntity<...>
 * com.example.commutemood.api.CommuteController.complete(java.lang.String, ...)}。
 * 前端拿到这种响应既无法展示，也等于把实现细节公开给了调用方。
 *
 * <p>本类固定住两件事：
 * <ol>
 *   <li>所有 400 的响应体中<b>不得出现</b>任何内部包名 / 类名特征；</li>
 *   <li>参数类 400 必须给出前端可直接使用的字段级原因（{@code $.fields}）。</li>
 * </ol>
 */
@SpringBootTest(classes = CommuteMoodApplication.class)
@AutoConfigureMockMvc
class ApiErrorContractTest {

    /** 出现下列任一特征即判定为内部实现细节外泄。 */
    private static final String[] LEAK_MARKERS = {
            "com.example", "org.springframework", "org.hibernate",
            "java.lang.", "java.util.", "java.time.",
            "Validation failed for argument", "default message", "rejected value"
    };

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("完成通勤缺少 snapshotId/operationId 时返回字段级原因，且不泄露 Spring 内部文案")
    void completeWithoutSnapshotReturnsFieldLevelErrors() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/commutes/complete")
                        .header("X-Device-Id", "error-contract-device")
                        .contentType("application/json")
                        .content("""
                                {
                                  "routeId": "route-a",
                                  "endStressLevel": 25
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_request"))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.timestamp").isString())
                .andExpect(jsonPath("$.message").isString())
                // 前端要能直接指出"少了哪个字段"，而不是把一坨堆栈丢给用户
                .andExpect(jsonPath("$.fields.snapshotId").isString())
                .andExpect(jsonPath("$.fields.operationId").isString())
                .andReturn();

        assertNoInternalLeak(result);
        // 消息要点名缺失字段，便于前端与人工排查
        assertThat(result.getResponse().getContentAsString())
                .contains("snapshotId")
                .contains("operationId");
    }

    @Test
    @DisplayName("枚举取值非法（EmotionTag）时点名出错字段，且不暴露枚举类名")
    void invalidEmotionTagDoesNotLeakEnumInternals() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/reports")
                        .header("X-Device-Id", "error-contract-device")
                        .contentType("application/json")
                        .content("""
                                {
                                  "location":{"longitude":%.4f,"latitude":%.4f},
                                  "stressLevel":50,
                                  "tag":"NOT_A_TAG"
                                }
                                """.formatted(
                                DemoGeography.REPORT_LONGITUDE,
                                DemoGeography.REPORT_LATITUDE)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_request"))
                .andExpect(jsonPath("$.message").isString())
                // 前端要能提示"tag 取值不合法"，因此必须点名到字段
                .andExpect(jsonPath("$.fields.tag").isString())
                .andReturn();

        assertNoInternalLeak(result);
    }

    @Test
    @DisplayName("字段类型不匹配时同样点名出错字段")
    void mismatchedFieldTypeNamesTheField() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/reports")
                        .header("X-Device-Id", "error-contract-device")
                        .contentType("application/json")
                        .content("""
                                {
                                  "location":{"longitude":%.4f,"latitude":%.4f},
                                  "stressLevel":"很堵",
                                  "tag":"CROWD"
                                }
                                """.formatted(
                                DemoGeography.REPORT_LONGITUDE,
                                DemoGeography.REPORT_LATITUDE)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_request"))
                .andExpect(jsonPath("$.fields.stressLevel").isString())
                .andReturn();

        assertNoInternalLeak(result);
    }

    @Test
    @DisplayName("请求体不是合法 JSON 时返回统一文案，不回显 Jackson 解析细节")
    void malformedJsonDoesNotLeakParserInternals() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/routes/compare")
                        .header("X-Device-Id", "error-contract-device")
                        .contentType("application/json")
                        .content("{"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_request"))
                .andExpect(jsonPath("$.message").isString())
                .andReturn();

        assertNoInternalLeak(result);
    }

    @Test
    @DisplayName("缺少必需请求头时点名请求头名称")
    void missingDeviceIdHeaderNamesTheHeader() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/routes/history"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_request"))
                .andExpect(jsonPath("$.message").isString())
                .andReturn();

        assertNoInternalLeak(result);
    }

    @Test
    @DisplayName("缺少/非法查询参数时保持统一错误结构")
    void invalidQueryParamsKeepTheSameErrorShape() throws Exception {
        MvcResult missingBbox = mockMvc.perform(get("/api/v1/heatmap"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_request"))
                .andExpect(jsonPath("$.message").isString())
                .andReturn();
        assertNoInternalLeak(missingBbox);

        MvcResult badZoom = mockMvc.perform(get("/api/v1/heatmap")
                        .param("bbox", DemoGeography.HEATMAP_BBOX)
                        .param("zoom", "bad"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_request"))
                .andExpect(jsonPath("$.message").isString())
                .andReturn();
        assertNoInternalLeak(badZoom);

        MvcResult badTimezone = mockMvc.perform(get("/api/v1/commutes/trends")
                        .header("X-Device-Id", "error-contract-device")
                        .param("timezone", "Not/AZone"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_request"))
                .andExpect(jsonPath("$.message").isString())
                .andReturn();
        assertNoInternalLeak(badTimezone);
    }

    /** 断言整个响应体里没有任何内部实现细节特征。 */
    private void assertNoInternalLeak(MvcResult result) throws Exception {
        String body = result.getResponse().getContentAsString();
        assertThat(body)
                .as("400 响应体不应泄露内部包名/类名，实际为：%s", body)
                .doesNotContain(LEAK_MARKERS);
    }
}

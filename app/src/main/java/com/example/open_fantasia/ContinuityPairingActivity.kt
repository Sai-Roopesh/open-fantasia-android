package com.example.open_fantasia

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.open_fantasia.theme.OpenFantasiaTheme

class ContinuityPairingActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val endpoint = intent?.data?.getQueryParameter("endpoint").orEmpty()
        val code = intent?.data?.getQueryParameter("code").orEmpty()
        val client = (application as OpenFantasiaApplication).appContainer.continuityHostClient

        setContent {
            OpenFantasiaTheme {
                var result by remember { mutableStateOf<String?>(null) }
                var succeeded by remember { mutableStateOf(false) }
                LaunchedEffect(endpoint, code) {
                    result = try {
                        client.pair(endpoint, code)
                        succeeded = true
                        "Your phone is paired with the Mac Host."
                    } catch (error: Throwable) {
                        error.message ?: "Pairing failed. Create a new code on your Mac and try again."
                    }
                }
                Column(
                    Modifier.fillMaxSize().background(Color(0xFF131317)).padding(28.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("Mac Host", color = Color.White, fontWeight = FontWeight.Bold)
                    if (result == null) {
                        CircularProgressIndicator(Modifier.padding(24.dp), color = Color(0xFF00FBFB))
                        Text("Pairing securely with your Mac…", color = Color.LightGray)
                    } else {
                        Text(result!!, color = if (succeeded) Color(0xFF7EE2A8) else Color(0xFFFF7AA8), modifier = Modifier.padding(24.dp))
                        Button(onClick = { finish() }) { Text("Done") }
                    }
                }
            }
        }
    }
}

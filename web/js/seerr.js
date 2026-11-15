function loadAdminPage() {

    topFunction();

    var html = '<div>';
    html += '<div class="form-group newline">';
    html += `<button class="form-control btn" name="admin_menu_return_button" id="admin_menu_return_button" onclick="AdminPageRedirect();"><img src="${root}/assets/trash.svg" class="btn_logo"></img><p2 id="admin_menu_return_button_text">Return</p2></button>`;
    html += '</div>';

    html += '<div class="form-group newline">';
    html += '<hr>';
    html += '</div>';

    html += '<form id="set_seerr_form" onsubmit="return false;">'

    html += '<div class="form-group newline">';
    html += '<label for="seerr_enabled" title="Include request statistics from Seerr (previously Overseerr) in the wrapped results.">Enable Seerr request statistics:<br>';
    html += '<input type="checkbox" class="form-control" id="seerr_enabled" /></label>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label for="seerr_apikey" title="The API key is needed for Wrapperr to read requests from Seerr. Found at Seerr->Settings->General->API Key.">Seerr API key:</label>';
    html += '<input type="text" class="form-control" id="seerr_apikey" autocomplete="off" placeholder="" /><br>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label for="seerr_ip" title="The IP address or domain that connects to Seerr. No subfolders, as this is another setting, but subdomains can be defined.">IP or domain for Seerr connection:</label>';
    html += '<input type="text" class="form-control" id="seerr_ip" placeholder="" /><br>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label for="seerr_port" title="The port Seerr uses for connections. Typically 5055, or 80/443 if a domain is used.">Port for Seerr:</label>';
    html += '<input type="number" class="form-control" id="seerr_port" placeholder="" /><br>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label for="seerr_root" title="Subfolder for Seerr, no slashes needed at the beginning or end. For example: \'seerr.com/subfolder\' would mean you enter \'subfolder\' here.">Seerr URL Base: (Optional)</label>';
    html += '<input type="text" class="form-control" id="seerr_root" autocomplete="off" placeholder=""/><br>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label for="seerr_https" title="Enable if your connection uses HTTPS.">Use HTTPS:</label>';
    html += '<input type="checkbox" class="form-control" id="seerr_https" /><br>';
    html += '</div>';

    html += '<div class="form-group newline">';
    html += `<button style="background-color: lightgrey;" type="button" class="form-control btn" id="test_seerr_connection_button" onclick="test_seerr_connection()"><img src="${root}/assets/synchronize.svg" class="btn_logo"><p2 id="test_seerr_text">Test Seerr connection</p2></button>`;
    html += '</div>';

    html += '<div class="form-group newline">';
    html += '<hr>';
    html += '</div>';

    html += '<div class="form-group newline">';
    html += `<button type="submit" class="form-control btn" onclick="set_seerr_settings_call();" id="set_seerr_form_button"><img src="${root}/assets/done.svg" class="btn_logo"></img><p2 id="set_seerr_form_button_text">Save</p2></button>`;
    html += '</div>';

    html += '</form>';

    html += '</div>';

    document.getElementById("setup").innerHTML = html;

    // Values are set on the elements rather than concatenated into the HTML
    document.getElementById("seerr_enabled").checked = seerr.seerr_enabled;
    document.getElementById("seerr_apikey").value = seerr.seerr_apikey;
    document.getElementById("seerr_ip").value = seerr.seerr_ip;
    document.getElementById("seerr_port").value = seerr.seerr_port;
    document.getElementById("seerr_root").value = seerr.seerr_root;
    document.getElementById("seerr_https").checked = seerr.seerr_https;
}

function get_seerr_form() {
    return {
        "seerr_enabled" : document.getElementById('seerr_enabled').checked,
        "seerr_apikey" : document.getElementById('seerr_apikey').value.trim(),
        "seerr_ip" : document.getElementById('seerr_ip').value.trim(),
        "seerr_port" : parseInt(document.getElementById('seerr_port').value),
        "seerr_root" : document.getElementById('seerr_root').value.trim(),
        "seerr_https" : document.getElementById('seerr_https').checked
    };
}

function set_seerr_settings_call() {
    document.getElementById("set_seerr_form_button").disabled = true;
    document.getElementById("set_seerr_form_button").style.opacity = '0.5';

    var seerr_form = get_seerr_form();

    if(seerr_form.seerr_enabled && (seerr_form.seerr_apikey === '' || seerr_form.seerr_ip === '' || isNaN(seerr_form.seerr_port) || seerr_form.seerr_port < 1)) {
        alert('An API key, IP/domain and port are required to enable Seerr.');
        document.getElementById("set_seerr_form_button").disabled = false;
        document.getElementById("set_seerr_form_button").style.opacity = '1';
        return;
    }

    if(isNaN(seerr_form.seerr_port)) {
        seerr_form.seerr_port = 0;
    }

    var seerr_settings_data = JSON.stringify({
        "clear_cache" : false,
        "data_type" : "seerr_config",
        "seerr_config" : seerr_form,
        "wrapperr_data" : {},
        "wrapperr_customize" : {}
    });

    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4) {

            try {
                var result= JSON.parse(this.responseText);
            } catch(error) {
                alert('Failed to parse API response.');
                console.log('Failed to parse API response. Response: ' + this.responseText)
                document.getElementById("set_seerr_form_button").disabled = false;
                document.getElementById("set_seerr_form_button").style.opacity = '1';
                return;
            }

            if(result.error) {
                alert(result.error);
                document.getElementById("set_seerr_form_button").disabled = false;
                document.getElementById("set_seerr_form_button").style.opacity = '1';
            } else {
                AdminPageRedirect();
            }

        }
    };
    xhttp.withCredentials = true;
    xhttp.open("post", api_url + "set/config");
    xhttp.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    xhttp.setRequestHeader("Authorization", cookie);
    xhttp.send(seerr_settings_data);
    return;
}

function test_seerr_connection() {
    var button = document.getElementById('test_seerr_connection_button');
    button.disabled = true;
    button.style.opacity = '0.5';
    button.style.backgroundColor = 'lightgrey';

    var config_data = JSON.stringify(get_seerr_form());

    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4) {
            button.disabled = false;
            button.style.opacity = '1';

            try {
                var result= JSON.parse(this.responseText);
            } catch(error) {
                console.log('Failed to parse API response. Response: ' + this.responseText)
                alert('Failed to parse API response.');
                button.style.backgroundColor = 'var(--red)';
                return;
            }

            if(result.error) {
                button.style.backgroundColor = 'var(--red)';
                alert(result.error);
                return
            }

            if(result.data) {
                button.style.backgroundColor = 'var(--green)';
            } else {
                button.style.backgroundColor = 'var(--red)';
            }
        }
    };
    xhttp.withCredentials = true;
    xhttp.open("post", api_url + 'get/seerr-connection');
    xhttp.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    xhttp.setRequestHeader("Authorization", cookie);
    xhttp.send(config_data);
}

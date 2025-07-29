#!/bin/bash

# ====================================================
# Configurações
# ====================================================
DURATION=${1:-70}           # duração do teste em segundos (padrão 120)
INTERVAL=2                   # intervalo entre coletas (segundos)
OUTPUT="usage-log-$(date +%Y%m%d-%H%M%S).log"
# ====================================================

# Obter limites dos containers
declare -A CPU_LIMITS MEM_LIMITS
get_limits() {
    while IFS=: read -r container cpus mem; do
        CPU_LIMITS[$container]=$cpus
        MEM_LIMITS[$container]=$mem
    done < <(docker inspect $(docker ps -q) | jq -r '.[] | 
        "\(.Name[1:]):\(.HostConfig.NanoCpus // 0):\(.HostConfig.Memory // 0)"')
}

# Formatar valores de memória
format_mem() {
    local bytes=$1
    if (( bytes >= 1073741824 )); then
        printf "%.1fGiB" $(echo "$bytes / 1073741824" | bc -l)
    elif (( bytes >= 1048576 )); then
        printf "%.1fMiB" $(echo "$bytes / 1048576" | bc -l)
    else
        printf "%.0fKiB" $(echo "$bytes / 1024" | bc -l)
    fi
}

# Cabeçalho
echo "Monitoring containers for $DURATION seconds..."
echo "Timestamp           | Container         | CPU Usage | CPU Limit | CPU % | Mem Usage | Mem Limit | Mem %" > "$OUTPUT"
echo "------------------------------------------------------------------------------------------------------" >> "$OUTPUT"

# Loop principal
end=$((SECONDS + DURATION))
while [ $SECONDS -lt $end ]; do
    get_limits
    timestamp=$(date +"%Y-%m-%d %H:%M:%S")
    
    docker stats --no-stream --format \
        "{{.Name}} {{.CPUPerc}} {{.MemUsage}}" | while read -r name cpu_perc mem_usage; do
        
        # Extrair valores de memória
        mem_used=$(echo "$mem_usage" | awk '{print $1}')
        mem_limit=$(echo "$mem_usage" | awk '{print $3}')

        # Obter limites configurados
        container_name=${name//\//}
        cpu_limit=${CPU_LIMITS[$container_name]}
        mem_limit_bytes=${MEM_LIMITS[$container_name]}

        # Calcular porcentagens
        cpu_pct=$(echo "$cpu_perc" | tr -d '%')
        mem_pct=$(docker inspect $container_name --format '{{.HostConfig.Memory}}' | \
            awk -v used="$mem_used" '{
                if($0 > 0) {
                    split(used, a, /[A-Za-z]/);
                    unit = substr(used, length(a[1])+1);
                    if(unit == "GiB") a[1] = a[1]*1024;
                    if(unit == "KiB") a[1] = a[1]/1024;
                    printf "%.1f", (a[1]*1024*1024)/$0 * 100
                } else {print "0.0"}
            }')

        # Converter limites de CPU
        if [[ $cpu_limit -gt 0 ]]; then
            cpu_limit_val=$(echo "scale=1; $cpu_limit / 1000000000" | bc)
        else
            cpu_limit_val="unlimited"
        fi

        # Formatar saída
        printf "%-20s | %-16s | %9s | %9s | %5s | %9s | %9s | %5s\n" \
            "$timestamp" \
            "$container_name" \
            "$cpu_perc" \
            "$cpu_limit_val" \
            "$cpu_pct%" \
            "$mem_used" \
            "$(format_mem $mem_limit_bytes)" \
            "${mem_pct}%" \
            >> "$OUTPUT"
    done
    
    sleep "$INTERVAL"
done

echo "Done. Log saved to: $OUTPUT"
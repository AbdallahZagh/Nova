<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:com="http://schemas.microsoft.com/appx/manifest/com/windows10">
  <xsl:param name="appId"/>
  <xsl:output method="xml" encoding="utf-8"/>
  <xsl:template match="@*|node()">
    <xsl:copy><xsl:apply-templates select="@*|node()"/></xsl:copy>
  </xsl:template>
  <xsl:template match="com:ComServer">
    <xsl:copy>
      <xsl:apply-templates select="@*|node()"/>
      <com:ExeServer Executable="NovaTaskflow.exe" DisplayName="Nova Taskflow Push" Arguments="----WindowsAppRuntimePushServer:">
        <com:Class Id="{$appId}" DisplayName="Nova Taskflow Push"/>
      </com:ExeServer>
    </xsl:copy>
  </xsl:template>
</xsl:stylesheet>

import unittest
from unittest.mock import patch, Mock
from designer_service import DesignerService

class CatalogAvailabilityTest(unittest.TestCase):
    def test_catalog_start_failure_does_not_prevent_service_or_close(self):
        with patch('designer_catalog_acceleration.CatalogAcceleration', side_effect=ConnectionError('offline')):
            service = DesignerService(catalog_acceleration=True)
        self.assertIsNone(service.catalog_acceleration)
        service.close()

    def test_broker_launch_does_not_wait_for_upstream_readiness(self):
        from designer_catalog_acceleration import CatalogAcceleration
        process = Mock()
        process.stdout.readline.return_value = '{"url":"http://localhost:1/token/"}'
        with patch('designer_catalog_acceleration.subprocess.Popen', return_value=process), patch('designer_catalog_acceleration.selectors.DefaultSelector') as selector, patch.object(CatalogAcceleration, 'call', side_effect=AssertionError('must not await warmup')):
            selector.return_value.select.return_value = [True]
            broker = CatalogAcceleration()
        self.assertEqual(broker.url, 'http://localhost:1/token/')
